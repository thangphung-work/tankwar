/**
 * Hệ thống Vật lý Đường đạn 3D Three.js - Hỗ trợ BẮN THẲNG & CẦU VỒNG
 * Hiệu ứng đạn pháo 3D rực lửa, kiểm tra va chạm địa hình 3D, tường móng ngựa và xe địch.
 */

// ỐNG NÒNG PHÁO CHÍNH là mục tiêu thật: hộp thân xe (Strongholds.segUnitBox) không tính nòng, nửa ngoài nòng (thò xa khỏi
// thân 3-4 m, chỗ dễ bị bắn cong nhất) trước đây đạn bay xuyên qua. Ống nòng = hình trụ bo đầu từ gốc nhóm nòng tới miệng
// nòng (theo đúng hướng tháp / góc ngóc lúc này), bán kính theo cỡ ống bọc nhiệt / cụm nòng. Xe trinh sát: súng nhỏ, bỏ qua
const BARREL_HIT_R = { ALL_ROUNDER: 1.4, ARTILLERY: 1.5, GATLING: 2.0 };
const _bhA = typeof THREE !== 'undefined' ? new THREE.Vector3() : null, _bhB = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
// Trả về tham số t (0..1) trên đoạn đường đạn P0 -> P0 + seg nơi đạn chạm ống nòng, hoặc -1
function segHitsBarrel(unit, px, py, pz, sx, sy, sz) {
  const r = BARREL_HIT_R[unit.tankType], bg = unit.barrelGroup;
  if (!r || !bg || !unit.muzzleTipLocal || !_bhA) return -1;
  _bhA.set(0, 0, 0).applyMatrix4(bg.matrixWorld);
  _bhB.copy(unit.muzzleTipLocal).applyMatrix4(bg.matrixWorld);
  // khoảng cách gần nhất giữa 2 đoạn thẳng (Ericson, Real-Time Collision Detection 5.1.9)
  const dx = _bhB.x - _bhA.x, dy = _bhB.y - _bhA.y, dz = _bhB.z - _bhA.z;
  const rx = px - _bhA.x, ry = py - _bhA.y, rz = pz - _bhA.z;
  const a = sx * sx + sy * sy + sz * sz, e = dx * dx + dy * dy + dz * dz, f = dx * rx + dy * ry + dz * rz;
  if (a < 1e-8 || e < 1e-8) return -1;
  const b = sx * dx + sy * dy + sz * dz, c = sx * rx + sy * ry + sz * rz, den = a * e - b * b;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
  else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
  const qx = px + sx * s - (_bhA.x + dx * t), qy = py + sy * s - (_bhA.y + dy * t), qz = pz + sz * s - (_bhA.z + dz * t);
  if (qx * qx + qy * qy + qz * qz > r * r) return -1;
  // lùi lại điểm chạm mặt ống (không lấy tâm ống): đi ngược đường đạn một đoạn bằng bán kính
  return Math.max(0, s - r / Math.sqrt(a));
}

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

  /**
   * ĐỘ TẢN MÁT TẠI ĐIỂM RƠI tính từ chính đường đạn hiện tại (độ nhạy của điểm rơi): lệch nòng lên/xuống, sang ngang
   * và dao động sơ tốc (σ lấy từ Dispersion.sigma — cùng σ dùng khi bắn thật) -> độ lệch chuẩn dọc / ngang hướng bắn
   * trên mặt đất. Bắn cầu vồng góc cao: lệch ngang nhân 1/cos(góc nòng), lệch sơ tốc kéo dài vùng rơi theo hướng bắn...
   * đúng như các phát bắn thật rải ra. Trả về { along, cross } (σ, đơn vị game) hoặc null.
   */
  impactSpread(shooter, terrain, sg) {
    if (!shooter || !terrain || !sg) return null;
    const ammo = shooter.selectedAmmo || 'NORMAL';
    const rp = this.roundParams(ammo, shooter, shooter.charge);
    const L = this.launchState(shooter.x, shooter.y, shooter.z, shooter.azimuth, shooter.elevation, rp.v0, shooter);
    const direct = this.isDirectFireShot(ammo, shooter.elevation);
    const sp = Math.hypot(L.vx, L.vy, L.vz) || 1;
    const dx = L.vx / sp, dy = L.vy / sp, dz = L.vz / sp;
    let rx = -dz, rz = dx;
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;
    const imp = (vx, vy, vz) => this.simulateShot(L.x, L.y, L.z, vx, vy, vz, rp, direct, terrain);
    const b = imp(L.vx, L.vy, L.vz);
    if (b.hitType === 'OUT') return null;
    let hx = b.x - L.x, hz = b.z - L.z;
    const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const e = 0.002, ev = 0.004;
    const part = (r, k) => [((r.x - b.x) * hx + (r.z - b.z) * hz) / k, ((r.x - b.x) * -hz + (r.z - b.z) * hx) / k];
    const pU = part(imp((dx + ux * e) * sp, (dy + uy * e) * sp, (dz + uz * e) * sp), e);
    const pR = part(imp((dx + rx * e) * sp, dy * sp, (dz + rz * e) * sp), e);
    const pV = part(imp(L.vx * (1 + ev), L.vy * (1 + ev), L.vz * (1 + ev)), ev);
    const comb = (i) => Math.hypot(pU[i] * sg.vert, pR[i] * sg.lat, pV[i] * sg.mv);
    return { along: comb(0), cross: comb(1) };
  }

  /**
   * VÙNG RẢI ĐẠN CON dự kiến của đạn chùm từ trạng thái đạn mẹ lúc tách vỏ (burst: vị trí + vận tốc):
   * mô phỏng các đạn con ở các mép của dải ngẫu nhiên trong spawnClusterAirburst (lực văng 0..CLUSTER_EJECT, giữ 60..94% quán tính,
   * tỏa tròn quanh trục bay) với đúng lực cản / trọng lực của đạn con -> elip theo hướng bắn.
   * Trả về { x, z: tâm vùng rải, along / cross: bán trục (chưa cộng bán kính nổ mỗi đạn con), yaw: hướng trục dài }
   * quick: chỉ cần tâm vùng rải (bộ giải ngắm) -> ít đạn con mẫu hơn
   */
  clusterFootprint(burst, terrain, quick = false) {
    if (!burst || !terrain) return null;
    const sp = Math.hypot(burst.vx, burst.vy, burst.vz) || 1;
    const fx = burst.vx / sp, fy = burst.vy / sp, fz = burst.vz / sp;
    // r1 = fwd x up, r2 = r1 x fwd (giống spawnClusterAirburst)
    let r1x = -fz, r1z = fx;
    const rl = Math.hypot(r1x, r1z) || 1; r1x /= rl; r1z /= rl;
    const r2x = -r1z * fy, r2y = r1z * fx - r1x * fz, r2z = r1x * fy;
    const rp = { k: this.dragCoeff * 6.5, g: this.gunGravity };
    const hx = burst.vx, hz = burst.vz, hl = Math.hypot(hx, hz) || 1, ux = hx / hl, uz = hz / hl;   // trục dọc hướng bắn
    const pts = [];
    const nA = quick ? 4 : 8;
    for (const carry of [0.6, 0.94]) for (const eject of quick ? [BallisticsSystem3D.CLUSTER_EJECT * 0.67] : [0, BallisticsSystem3D.CLUSTER_EJECT]) for (let k = 0; k < nA; k++) {
      const a = k / nA * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const vx = burst.vx * carry + (r1x * c + r2x * sn) * eject;
      const vy = burst.vy * carry + r2y * sn * eject - 6;
      const vz = burst.vz * carry + (r1z * c + r2z * sn) * eject;
      const r = this.simulateShot(burst.x, burst.y - 2, burst.z, vx, vy, vz, rp, false, terrain);
      pts.push(r);
    }
    let mx = 0, mz = 0;
    for (const p of pts) { mx += p.x; mz += p.z; }
    mx /= pts.length; mz /= pts.length;
    let along = 0, cross = 0;
    for (const p of pts) {
      const dx = p.x - mx, dz = p.z - mz;
      along = Math.max(along, Math.abs(dx * ux + dz * uz));
      cross = Math.max(cross, Math.abs(-dx * uz + dz * ux));
    }
    return { x: mx, z: mz, along, cross, yaw: Math.atan2(ux, uz) };
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

  // Đạn chùm chạm công trình (nóc nhà cao, tường, cứ điểm) trước khi xuống tới độ cao tách vỏ: ngòi chạm kích liều phóng,
  // đạn con bung ngay trước mặt chạm rồi rơi / găm lên mái, tường. Trước đây đạn mẹ nổ như một quả lựu đạn phá 155 mm
  // (bảng CLUSTER x pháo nặng) mà không rải đạn con nào
  clusterImpactBurst(s, i, terrain, allUnits, onImpact) {
    const v = Math.hypot(s.vx, s.vy, s.vz) || 1;
    s.x -= s.vx / v * 3; s.y -= s.vy / v * 3; s.z -= s.vz / v * 3;
    this.spawnClusterAirburst(s, terrain, allUnits, onImpact);
    this.removeShellMesh(s, i);
  }

  // Đạn chùm tách vỏ trên không: bung CLUSTER_SUB_COUNT đạn con rải elip ~±9-11 m quanh điểm ngắm
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
    const subCount = BallisticsSystem3D.CLUSTER_SUB_COUNT;
    const fwd = new THREE.Vector3(shell.vx, shell.vy, shell.vz);
    const sp0 = fwd.length() || 1;
    fwd.divideScalar(sp0);
    let r1 = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (r1.lengthSq() < 1e-4) r1.set(1, 0, 0);
    r1.normalize();
    const r2 = new THREE.Vector3().crossVectors(r1, fwd).normalize();
    for (let k = 0; k < subCount; k++) {
      const angle = (k / subCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      // Tốc độ phóng đạn con & phần quán tính giữ lại dao động rộng -> vùng rải elip lớn như thực tế. Lực văng CLUSTER_EJECT·√ngẫu nhiên:
      // đạn con phủ đều cả đĩa (trước đây 50..145 -> vành khuyên rỗng giữa, xe đứng đúng điểm ngắm gần như không bị trúng thẳng)
      const eject = BallisticsSystem3D.CLUSTER_EJECT * Math.sqrt(Math.random());
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
        burstSeed: ((shell.burstSeed || 0) + Math.imul(this.activeShells.length + 1, 2654435761)) >>> 0,
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
   * (pháo tăng APFSDS bay gần như thẳng tới ~2 km game, lựu pháo cầu vồng phủ ~0.12–0.75 cạnh bản đồ).
   */
  roundParams(ammoType, shooter = null, chargeLevel = 1, roundKey = null) {
    // Xe trinh sát lắp vũ khí chính trên chân đế mô-đun (ô VŨ KHÍ CHÍNH): đạn súng thay bằng lựu 40mm HV / rocket ->
    // đường đạn (cả máy tính hỏa lực ngắm theo đạn đang chọn) theo vũ khí thật đang lắp
    const mw = shooter && shooter.mainGun && shooter.mainGun.kind;
    // giàn rocket bắn đạn 'RPG' (spg.js fireMainModule) -> cùng thông số với bộ giải ngắm (đang chọn đạn súng)
    if (mw === 'rocket' && ammoType === 'RPG') return this.roundParams('RPG', null, chargeLevel, 'ROCKET_POD');
    if (mw && (ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY' || ammoType === 'GATLING_BULLET')) {
      if (mw === 'rocket') {
        // rocket giàn ~650 m/s, cháy ~400 m (game_timing ROCKET_POD) — trước đây mượn đạn B-40 vác vai 290 m/s
        const r = this.roundParams('RPG', null, chargeLevel, 'ROCKET_POD');
        r.maxTravel = BallisticsSystem3D.MAIN_ROCKET_TRAVEL;   // rocket giàn có động cơ dài hơn đạn B-40 vác vai
        return r;
      }
      if (mw === 'agl') {
        // lựu 40mm HV (Mk19 / Mk47): 241 m/s, cản ~4,5e-4/m -> xa nhất ~2,2 km ở ~37°, tới 1,5 km mất ~9 s
        // (trước đây 0.42 x 1080 = 454 m/s, cản 0,6 lần đạn 30mm: bay tới 6,6 km)
        const r = this.roundParams('GATLING_BULLET', null, chargeLevel);
        r.v0 *= BallisticsSystem3D.MAIN_AGL_V; r.k *= BallisticsSystem3D.MAIN_AGL_K;
        r.maxTravel = BallisticsSystem3D.MAIN_AGL_TRAVEL;    // quỹ đạo cầu vồng dài hơn đường bay căng của đạn 30mm
        r.lifeTravel = 0; r.minV = 0;                        // quả lựu bay tới khi chạm (fireShell3D gl40)
        return r;
      }
    }
    const type = shooter ? shooter.tankType : null;
    const M = this.bulletSpeedMultiplier || 1;
    const GT = typeof GameTiming !== 'undefined' ? GameTiming : null;
    if (!GT) return { v0: 560, g: this.gunGravity, k: this.dragCoeff, maxTravel: 0, eff: 1700, guided: false };
    const r = GT.round(ammoType, type, this.artyChargeMulOf(chargeLevel), roundKey);
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
      burnTravel: r.burnTravel || 0,
      // các hệ số theo "giây mô phỏng" (= giây game x M) như v0 / g
      wc: r.wc ? r.wc / M : 0,                 // quay mũi theo gió khi động cơ cháy (integrateFlight)
      windMul: r.windMul || 1,                 // gió theo tỉ lệ riêng của lựu pháo
      hRho: r.hRho || 0,                       // không khí loãng theo độ cao (lựu pháo)
      lifeTravel: r.lifeTravel || 0,           // đạn súng: vạch đường tắt ở maxTravel, đầu đạn còn bay tới đây
      minV: r.minV ? r.minV / M : 0
    };
  }

  gravityFor(ammoType, isDirectFire, shooter = null) {
    return this.roundParams(ammoType, shooter).g;
  }

  // Hệ số sơ tốc theo liều phóng lựu pháo (1 = đầy ... 7 = nhỏ nhất)
  artyChargeMulOf(chargeLevel) {
    const C = (typeof GameTiming !== 'undefined' && GameTiming.REAL.artyCharges) || [1, 0.8, 0.62, 0.44, 0.34, 0.26, 0.2, 0.14, 0.1, 0.07];
    const z = Math.max(1, Math.min(C.length, Math.round(chargeLevel || 1)));
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
  // Trả đối tượng dùng lại (nơi gọi đọc ngay, không giữ): { x, y, z, t } — t: vị trí chạm trên đoạn (0..1)
  groundCrossing(terrain, x0, y0, z0, x1, y1, z1, off = 0) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    let lo = 0, hi = 1;
    if (y0 - terrain.getElevationAt(x0, z0) + off > 0) {
      for (let k = 0; k < 10; k++) {
        const m = (lo + hi) / 2;
        if ((y0 + dy * m) - terrain.getElevationAt(x0 + dx * m, z0 + dz * m) + off > 0) lo = m; else hi = m;
      }
    }
    const R = this._gcOut || (this._gcOut = { x: 0, y: 0, z: 0, t: 0 });
    R.x = x0 + dx * hi; R.z = z0 + dz * hi; R.y = terrain.getElevationAt(R.x, R.z); R.t = hi;
    return R;
  }

  // VẬT CẢN "ĐIỂM TRONG KHỐI" (bao cát, đá tảng, công sự móng ngựa, mốc địa hình, đống đổ nát) dọc đoạn bay.
  // checkHorseshoeCollision chỉ thử 1 điểm: trước đây thử cuối + giữa đoạn -> bao cát dày ~5 đv lọt giữa 2 mẫu khi máy
  // chậm, và điểm nổ đặt ở CUỐI đoạn (phía sau vật che -> vật che không chắn sóng nổ). Lọc nhanh bằng vòng bao từng vật
  // cản -> chỉ dò dày (<= 2 đv) trên các khúc đoạn bay đi gần vật cản, rồi chia đôi tìm đúng mặt chạm.
  // Trả kết quả va chạm (type, ...) kèm x, y, z = mặt chạm và t (0..1) trên đoạn; không trúng: null
  // ammo (tùy chọn): loại đạn — rào gỗ / tre để đạn động năng bay lọt qua (PropSet.wallHit); không truyền = đạn có ngòi nổ
  obstacleSegmentHit(terrain, x0, y0, z0, x1, y1, z1, skipBuildings, ceilY = Infinity, ammo) {
    const T = terrain;
    if (!T || typeof T.checkHorseshoeCollision !== 'function') return null;
    if (y0 >= ceilY && y1 >= ceilY) return null;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const R = this._segR || (this._segR = []);
    R.length = 0;
    if (Array.isArray(T.boulders) && Array.isArray(T.horseshoeForts) && Array.isArray(T.buildings)) {
      const a = dx * dx + dz * dz;
      const mnX = Math.min(x0, x1), mxX = Math.max(x0, x1), mnZ = Math.min(z0, z1), mxZ = Math.max(z0, z1);
      const PS = T.propSet;
      if (PS && PS.bagSegs) {
        for (const sg of PS.bagSegs) {
          if (sg.dead) continue;
          const r = Math.hypot(sg.x1 - sg.x0, sg.z1 - sg.z0) * 0.5 + 2.7;
          this._segCircle(R, x0, y0, z0, dx, dy, dz, a, (sg.x0 + sg.x1) * 0.5, (sg.z0 + sg.z1) * 0.5, r,
            Math.min(sg.g0, sg.g1) - 2.1, Math.max(sg.g0, sg.g1) + sg.top + 0.1);
        }
      }
      // XE CON DÂN SỰ (props: hitTest trả car): trước đây không có trong danh sách dò -> đạn bay xuyên xe như không khí
      // (chỉ chạm khi xe đứng trong vòng dò của nhà / đá gần đó). Lấy xe ở các ô lưới 60 đv quanh đoạn bay (như hitTest)
      const ST = PS && PS.street;
      if (ST && ST.grid) {
        for (let gi = Math.floor((mnX - 24) / 60); gi <= Math.floor((mxX + 24) / 60); gi++) {
          for (let gj = Math.floor((mnZ - 24) / 60); gj <= Math.floor((mxZ + 24) / 60); gj++) {
            const l = ST.grid.get(gi * 1000 + gj);
            if (l) for (const o of l) if (o.type === 'car' && !(o.c >= 0.85)) this._segCircle(R, x0, y0, z0, dx, dy, dz, a, o.x, o.z, 23, o.y - 1.5, o.y + 30);
          }
        }
      }
      // tường rào đá / đất, rào gỗ / tre: hộp chữ nhật xoay theo trục tường (vòng bao tròn của tường dài mảnh thừa quá nhiều
      // chỗ phải dò dày)
      if (PS && PS.wallRuns) {
        for (const w of PS.wallRuns) {
          if (w.maxX < mnX || w.minX > mxX || w.maxZ < mnZ || w.minZ > mxZ) continue;
          this._segBox(R, x0, y0, z0, dx, dy, dz, w.cx, w.cz, w.ux, w.uz, w.hl, w.ht, w.y0, w.y1);
        }
      }
      if (T.landmarkSet && T.landmarkSet.items) {
        for (const it of T.landmarkSet.items) this._segCircle(R, x0, y0, z0, dx, dy, dz, a, it.x, it.z, it.reach * 1.415 + 0.5, it.G - 12.1, it.top + 2.1);
      }
      for (const b of T.buildings) {
        const rb = b.radius * 1.415 + 1;
        if (b.x + rb < mnX || b.x - rb > mxX || b.z + rb < mnZ || b.z - rb > mxZ) continue;
        if (b.ref && skipBuildings && !b.ref.collapsed) continue;
        this._segCircle(R, x0, y0, z0, dx, dy, dz, a, b.x, b.z, rb, -Infinity, Infinity);
      }
      for (const f of T.horseshoeForts) this._segCircle(R, x0, y0, z0, dx, dy, dz, a, f.x, f.z, f.outerRadius + 15.5, -Infinity, Infinity);
      for (const rock of T.boulders) {
        if (rock.noShot) continue;
        const rr = rock.radius + 0.5;
        if (rock.x + rr < mnX || rock.x - rr > mxX || rock.z + rr < mnZ || rock.z - rr > mxZ) continue;
        const gy = T.groundAtRaw ? T.groundAtRaw(rock.x, rock.z) : NaN;
        this._segCircle(R, x0, y0, z0, dx, dy, dz, a, rock.x, rock.z, rr, gy === gy ? gy - 5.1 : -Infinity, gy === gy ? gy + rock.height + 0.1 : Infinity);
      }
    } else R.push(0, 1);   // nguồn địa hình khác (bãi thử...): dò cả đoạn
    const n = R.length;
    if (!n) return null;
    // xếp các khúc theo đầu khúc (thường 0-2 khúc), gộp khúc chồng nhau khi dò
    for (let i = 2; i < n; i += 2) {
      for (let j = i; j >= 2 && R[j - 2] > R[j]; j -= 2) {
        const a0 = R[j - 2], b0 = R[j - 1];
        R[j - 2] = R[j]; R[j - 1] = R[j + 1]; R[j] = a0; R[j + 1] = b0;
      }
    }
    let i = 0;
    while (i < n) {
      const ta = R[i];
      let tb = R[i + 1];
      i += 2;
      while (i < n && R[i] <= tb) { if (R[i + 1] > tb) tb = R[i + 1]; i += 2; }
      const m = Math.max(1, Math.ceil((tb - ta) * L / 2));
      let tc = -1;
      for (let j = 0; j <= m; j++) {
        const t = ta + (tb - ta) * j / m;
        let h = T.checkHorseshoeCollision(x0 + dx * t, y0 + dy * t, z0 + dz * t, skipBuildings, ammo);
        if (!h || !h.hit) { tc = t; continue; }
        let hi = t;
        if (tc >= 0) {
          let lo = tc;
          for (let k = 0; k < 8; k++) {
            const md = (lo + hi) * 0.5, hm = T.checkHorseshoeCollision(x0 + dx * md, y0 + dy * md, z0 + dz * md, skipBuildings, ammo);
            if (hm && hm.hit) { hi = md; h = hm; } else lo = md;
          }
        }
        h.x = x0 + dx * hi; h.y = y0 + dy * hi; h.z = z0 + dz * hi; h.t = hi;
        return h;
      }
    }
    return null;
  }

  // Khúc t (0..1) của đoạn bay nằm trong vòng tròn (cx, cz, r) trên mặt bằng và trong dải cao [yMin, yMax] -> thêm vào R
  _segCircle(R, x0, y0, z0, dx, dy, dz, a, cx, cz, r, yMin, yMax) {
    const fx = x0 - cx, fz = z0 - cz, c = fx * fx + fz * fz - r * r;
    let ta = 0, tb = 1;
    if (a < 1e-9) {
      if (c > 0) return;
    } else {
      const b = fx * dx + fz * dz, disc = b * b - a * c;
      if (disc < 0) return;
      const sq = Math.sqrt(disc);
      ta = (-b - sq) / a; tb = (-b + sq) / a;
      if (ta > 1 || tb < 0) return;
      if (ta < 0) ta = 0;
      if (tb > 1) tb = 1;
    }
    const ya = y0 + dy * ta, yb = y0 + dy * tb;
    if ((ya > yMax && yb > yMax) || (ya < yMin && yb < yMin)) return;
    R.push(ta, tb);
  }

  // Khúc t (0..1) của đoạn bay nằm trong hộp chữ nhật xoay trên mặt bằng (tâm cx, cz; trục dọc ux, uz đơn vị; nửa dài hl,
  // nửa dày ht) và trong dải cao [yMin, yMax] -> thêm vào R (cắt lần lượt theo trục dọc & trục ngang, kiểu Liang-Barsky)
  _segBox(R, x0, y0, z0, dx, dy, dz, cx, cz, ux, uz, hl, ht, yMin, yMax) {
    const px = x0 - cx, pz = z0 - cz;
    let ta = 0, tb = 1;
    const pa = px * ux + pz * uz, da = dx * ux + dz * uz;
    if (Math.abs(da) < 1e-9) { if (pa > hl || pa < -hl) return; }
    else {
      let t0 = (-hl - pa) / da, t1 = (hl - pa) / da;
      if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
      if (t0 > ta) ta = t0;
      if (t1 < tb) tb = t1;
      if (ta > tb) return;
    }
    const pb = pz * ux - px * uz, db = dz * ux - dx * uz;
    if (Math.abs(db) < 1e-9) { if (pb > ht || pb < -ht) return; }
    else {
      let t0 = (-ht - pb) / db, t1 = (ht - pb) / db;
      if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
      if (t0 > ta) ta = t0;
      if (t1 < tb) tb = t1;
      if (ta > tb) return;
    }
    const ya = y0 + dy * ta, yb = y0 + dy * tb;
    if ((ya > yMax && yb > yMax) || (ya < yMin && yb < yMin)) return;
    R.push(ta, tb);
  }

  fireShell3D(shooter, azimuth, elevation, chargeLevel, ammoType = 'NORMAL') {
    // xe vừa hồi sinh nổ súng là mất khiên bất tử (khiên để kịp rời điểm hồi sinh, không để bắn miễn phí)
    if (shooter && shooter.invulnerableTimer > 0 && !shooter.isDead) shooter.invulnerableTimer = 0;
    const isDirectFire = this.isDirectFireShot(ammoType, elevation);
    const rp = this.roundParams(ammoType, shooter, chargeLevel);
    // Tên lửa / đạn phản lực rời ống phóng chậm rồi động cơ đẩy tăng tốc (không bắn ra với tốc độ hành trình)
    const v0 = rp.guided ? rp.v0 * 0.3 : rp.v0;

    let startX, startY, startZ;
    let vx, vy, vz;
    let fireDir, aimDir = null;

    // Lấy tọa độ và vector hướng thực tế từ miệng nòng pháo 3D (hoặc miệng ống phóng tên lửa)
    if (shooter && (shooter._launchOverride || typeof shooter.getMuzzleWorldTransform === 'function')) {
      const muzzle = shooter._launchOverride || shooter.getMuzzleWorldTransform();
      startX = muzzle.position.x;
      startY = muzzle.position.y;
      startZ = muzzle.position.z;
      fireDir = muzzle.boreDir || muzzle.direction;   // nòng cong: đạn theo ống nòng, không theo đường ngắm (spg.js)
      aimDir = muzzle.aimDir || null;   // ống phóng cố định (không ngóc theo súng): hướng ngắm thật của xạ thủ
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
      // loạt mới khi xe đã ngừng bắn lâu hơn 1,5 nhịp bắn — theo THỜI GIAN (trước đây đếm 3 khung hình: 144 khung/s thì
      // viên nào cũng thành viên đầu loạt -> toàn đạn vạch đường, hạt giống tản mát theo loạt phụ thuộc tốc độ khung hình).
      // Thời điểm bắn trừ phần trễ trong khung (_shotLead, spg.js): nhiều viên bắn trong một khung vẫn cách đều đúng nhịp.
      // _shotIval: nhịp bắn do vòng bắn liên thanh gắn; nguồn bắn khác (trạm nóc tháp, tái hiện mạng) dùng ngưỡng 0,25 s
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 - (shooter._shotLead || 0);
      const gap = shooter._shotIval > 0 ? Math.max(0.05, 1.5 * shooter._shotIval) : 0.25;
      if (shooter._beltT === undefined || now - shooter._beltT > gap) shooter._beltIdx = 0;
      shooter._beltT = now;
      tracer = (shooter._beltIdx++ % (ammoType === 'INCENDIARY' ? 2 : 4)) === 0;
    }
    // Độ tản mát: hướng đạn lệch ngẫu nhiên quanh hướng nòng theo loại pháo + trạng thái xe (chạy, quay tháp, vừa bắn...)
    // — như nhau cho người chơi và bot (xem dispersion.js).
    // Tái hiện phát bắn của máy khác (_remoteShot, netcode.js): vận tốc thật được gửi kèm và ghi đè ngay sau -> bỏ mô phỏng
    // cự ly + tản mát (tốn công vô ích và làm lệch bộ đếm độ nở / số phát của xe bản sao)
    if (shooter && typeof Dispersion !== 'undefined' && !this._remoteShot) {
      const stream = ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY';
      // cự ly tới điểm rơi dự kiến (chưa tản mát): bắn càng xa càng kém chụm (dispersion.js rangeMul)
      let range = 0;
      const T = !stream && !rp.guided && this.terrainProvider ? this.terrainProvider() : null;
      if (T) {
        const r = this.simulateShot(startX, startY, startZ, vx, vy, vz, rp, isDirectFire, T);
        range = Math.hypot(r.x - startX, r.z - startZ);
      }
      const p = Dispersion.perturb(shooter, ammoType, elevation, vx, vy, vz, stream, range);
      vx = p.vx; vy = p.vy; vz = p.vz;
    }
    // Lựu 40mm (súng phóng lựu: vũ khí chính trên chân đế xe trinh sát / trạm nóc tháp xe tăng) vẫn bắn theo hệ đạn 30mm
    // (ammoType GATLING_BULLET + cờ gl40 do bên gọi gắn) nhưng HÌNH là quả lựu thật: không vạch đường, thấy ngay từ miệng
    // nòng, bay tới khi chạm (không tự biến mất giữa trời khi hết maxTravel như đạn vạch đường)
    const gl40 = ammoType === 'GATLING_BULLET' && !!shooter && ((shooter.mainGun && shooter.mainGun.kind === 'agl') || (!!shooter._launchOverride && shooter.roofWeapon === 'agl'));
    if (gl40) tracer = false;
    const shellMesh = this.createShell155Mesh(isDirectFire, gl40 ? 'GL40' : ammoType, !!(shooter && shooter.tankType === 'ARTILLERY'), tracer);
    // đạn súng: liều vạch đường chỉ bén cháy sau khi rời nòng ~10 m (như đạn thật) -> không có đốm lửa sát miệng nòng
    const smallArms = !gl40 && (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY');
    if (smallArms) shellMesh.visible = false;
    // Đạn APFSDS: 3 mảnh guốc đạn tách khỏi mũi tên ngay khi rời nòng
    if (ammoType === 'AP' && this.fx && this.fx.sabotDiscard) {
      this.fx.sabotDiscard(startX, startY, startZ, vx, vy, vz);
    }
    shellMesh.position.set(startX, startY, startZ);

    // Định hướng ban đầu mũi đạn trùng với trục vector vận tốc (trục Y cục bộ của Mesh)
    const initDir = new THREE.Vector3(vx, vy, vz).normalize();
    shellMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), initDir);

    this.scene.add(shellMesh);

    // Đạn 30mm nổ trên không (đạn cao cấp 'ahead30'): máy tính hỏa lực đang khóa drone & radar phòng không còn -> nạp cự
    // ly nổ = cự ly tới drone trừ một đoạn (nổ ngay trước drone, chùm bi phủ tới thân). game.js đặt shooter._abmRange
    const abm = ammoType === 'GATLING_BULLET' && shooter && shooter._abmRange > 30 && shooter.ammoMods && shooter.ammoMods.GATLING_ABM
      && !(shooter.dmg && shooter.dmg.lost && shooter.dmg.lost.has('aaRadar')) ? shooter._abmRange - 8 : 0;
    const shell = {
      abm,
      id: Math.random().toString(36).substring(2, 9),
      // hạt giống quyết định nổ trên tán (tree burst); gửi kèm sự kiện bắn -> máy khác nổ cùng cây, cùng chỗ
      burstSeed: (Math.random() * 4294967296) >>> 0,
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
      // (độ cao điểm bắn cho cản theo độ cao, quay mũi theo gió khi động cơ cháy, tỉ lệ gió lựu pháo, tầm bay còn sát thương
      //  sau khi vạch đường tắt / tốc độ tối thiểu còn sát thương của đạn súng)
      y0: startY, hRho: rp.hRho || 0, wc: rp.wc || 0, windMul: rp.windMul || 1, lifeTravel: rp.lifeTravel || 0, minV: rp.minV || 0,
      spinAngle: 0,
      trailTimer: 0,
      tracer,
      ignite: smallArms ? 80 : 0,
      exploded: false,
      gl: gl40
    };
    if (gl40) shell.maxTravel = 0;
    // viên bắn sớm trong khung (vòng bắn liên thanh còn dư thời gian): bay trước phần trễ đó ở lần cập nhật đầu (updateShells3D)
    if (shooter && shooter._shotLead > 0) shell.lead = Math.min(0.1, shooter._shotLead) * (this.bulletSpeedMultiplier || 1);
    // mũi tên lõi urani nghèo (đạn cao cấp 'ap_du'): hiệu ứng trúng riêng (mảnh tự bốc cháy) + dễ gây cháy trong khoang.
    // Trang bị của xe bắn có trên mọi máy -> máy khác tái hiện phát bắn cũng tự gắn đúng cờ
    if (ammoType === 'AP' && shooter && shooter.ammoMods && shooter.ammoMods.AP && shooter.ammoMods.AP.du) shell.du = true;
    // đạn cháy 12.7 của xe trinh sát (cùng điều kiện hmgInc ở game.onShellImpact): bay xuyên tán cây nóng ít hơn đạn cháy 30mm
    if (ammoType === 'INCENDIARY' && shooter && shooter.tankType === 'SCOUT') shell.hmg = true;
    // đạn nổ-cháy-xuyên Mk211 (đạn cao cấp 'mk211') của súng 12.7 xe trinh sát; có cả SLAP thì dây đạn trộn 1:1. Theo số thứ
    // tự viên trong loạt (_beltIdx) -> mọi máy cùng biết viên nào là Mk211
    if (ammoType === 'SCOUT_BULLET' && shooter && shooter.tankType === 'SCOUT' && !shooter._roofShot && !(shooter.mainGun && shooter.mainGun.kind)
      && shooter.ammoMods && shooter.ammoMods.HMG_HEIAP) shell.heiap = !shooter.ammoMods.SCOUT_BULLET || ((shooter._beltIdx || 0) % 2 === 1);

    // Tên lửa có điều khiển: bám mục tiêu xe trinh sát chỉ định (khóa) hoặc điểm ngắm, động cơ đẩy tới tốc độ hành trình
    if (rp.guided) {
      const tg = shooter && shooter.missileTarget;
      // tên lửa tấn công đỉnh (đạn cao cấp 'topatk' của xe trinh sát): vồng cao rồi bổ nhào xuống nóc (guideMissile)
      const tm = shooter && shooter.ammoMods && shooter.ammoMods.ANTI_TANK_MISSILE;
      shell.guide = {
        top: !!(tm && tm.top),
        // bắn-và-quên (đạn cao cấp 'topatk' xe trinh sát & bệ đột nóc xe tăng, kiểu Javelin): đầu dò ảnh nhiệt trên tên lửa tự
        // bám sau khi phóng — không cần xe phóng còn sống / giữ đường ngắm (guideMissile). Tên lửa thường: dẫn theo đường ngắm / laser
        fnf: !!(tm && tm.top),
        cruise: rp.v0, turnAcc: rp.turnAcc, boostT: rp.boostT,
        targetId: tg && tg.unit ? tg.unit.id : null,
        point: tg && tg.point ? { x: tg.point.x, y: tg.point.y, z: tg.point.z } : null,
        lost: false
      };
      // DRONE (phòng không): tg.air = xe chủ drone. Dẫn theo tia laser từ kính ngắm xe bắn (guideAirMissile), ngòi cận đích
      if (tg && tg.air) {
        shell.guide.airOwner = tg.air.id;
        shell.guide.top = false;
        shell.guide.fnf = false;   // đánh drone: dẫn theo tia laser của kính ngắm
        const T = this.airTargetOf(tg.air.id);
        if (T) shell.guide.point = { x: T.x, y: T.y, z: T.z };
      }
      // Đang khóa xe: lấy ngay vị trí xe lúc phóng làm điểm dẫn ban đầu (không bay thẳng theo ống phóng
      // khi khung hình đầu chưa xác nhận được tầm nhìn)
      if (tg && tg.unit && !shell.guide.point) {
        const u = tg.unit;
        shell.guide.point = { x: u.x, y: (u.y || 0) + 7, z: u.z };
      }
      if (!shell.guide.targetId && !shell.guide.point) {
        // Không chỉ định mục tiêu: bay theo đường ngắm (ống cố định: rời ống rồi tự dẫn lên đường ngắm) tới hết tầm
        const ad = aimDir || fireDir;
        shell.guide.point = { x: startX + ad.x * rp.maxTravel, y: startY + ad.y * rp.maxTravel, z: startZ + ad.z * rp.maxTravel };
      }
    }
    if (rp.burnTravel) shell.burnTravel = rp.burnTravel;

    this.activeShells.push(shell);
    // người chơi vừa bắn (mọi loại vũ khí): game giật kính ngắm / rung camera theo cỡ đạn
    if (shooter && shooter.isPlayer && this.onPlayerShot) this.onPlayerShot(shell, shooter);
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
    if (G.airOwner !== undefined && G.airOwner !== null) return this.guideAirMissile(s, dt, allUnits, terrain);
    // PHÓNG NGUỘI (bệ tên lửa đột nóc nóc tháp xe tăng): khí nén đẩy tên lửa ra khỏi ống, động cơ chưa cháy — chỉ trôi theo
    // đà + chúc nhẹ vì trọng lực, cánh lái chưa làm việc. Rời ống một đoạn mới đánh lửa (tránh lửa phụt táp vào xe mình)
    const cold = G.cold || 0;
    if (cold && s.timeAlive < cold) { s.vy -= (G.coldG || 0) * dt; return; }
    if (s.cold) {
      s.cold = false;
      s.lastTailPos = null;   // vệt khói bắt đầu từ chỗ đánh lửa, không kéo dài từ miệng ống
      if (s.mesh) s.mesh.traverse(o => { if (o.userData.tracer) o.visible = true; });
      if (this.onMissileIgnite) this.onMissileIgnite(s);
    }
    // tăng tốc tới tốc độ hành trình
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const accel = G.cruise / Math.max(0.05, G.boostT || 0.3);
    const newSp = Math.min(G.cruise, sp + accel * dt);
    let ux = s.vx / sp, uy = s.vy / sp, uz = s.vz / sp;
    if (!G.lost) {
      let shooter = null, target = null;
      if (allUnits) for (const u of allUnits) { if (u.id === s.shooterId) shooter = u; if (G.targetId && u.id === G.targetId) target = u; }
      if (!G.fnf && s.timeAlive > 0.15 && (!shooter || shooter.isDead)) G.lost = true;   // đứt dây / mất xe điều khiển (bắn-và-quên: không cần)
      if (target && !target.isDead) {
        // kíp xe phải tự nhìn thấy mục tiêu (giữ dấu ngắm trên xe địch); khuất tầm nhìn -> bay tới chỗ thấy lần cuối
        // Phòng thử nghiệm ("luôn hiện mục tiêu"): mục tiêu đang hiện trên màn hình của người chơi cũng tính là thấy.
        // Trận thật vẫn bắt buộc tự nhìn thấy trực tiếp (tên lửa dẫn theo đường ngắm, đồng đội báo vị trí không đủ)
        const onScreen = !!(window.STRONGHOLD_LAB && shooter && shooter.isPlayer && target.group && target.group.visible && !target.isHiddenFromPlayer);
        // khói đa phổ (mục tiêu phóng khói lúc đang bị khóa) hoặc màn khói che giữa tên lửa và mục tiêu: đầu dò mất mục tiêu, bay tới chỗ thấy lần cuối
        const veiled = typeof Equipment !== 'undefined' && ((Equipment.lockBlocked && Equipment.lockBlocked(target, s.shooterTeam))
          || (Equipment.smokeBlocks && Equipment.smokeBlocks(s.x, s.z, target.x, target.z)));
        // bắn-và-quên: đầu dò ảnh nhiệt trên tên lửa tự nhìn — mất dấu khi mục tiêu lẩn vào bụi rậm (chưa vừa nổ súng) / rừng rậm
        const seekerLost = !!G.fnf && ((target.isInBush && !((target.revealTimer || 0) > 0))
          || (target.forestDens || 0) >= (typeof BattleTerrain3D !== 'undefined' ? BattleTerrain3D.FOREST_DENSE : 10));
        const seen = !(target._netHidden) && !veiled && !seekerLost
          && (G.fnf || !shooter || onScreen || ((typeof TeamIntel === 'undefined' || TeamIntel.seesDirect(shooter, target))
            // đường ngắm thật như lúc khóa (game.hasLineOfSight): mục tiêu lách ra sau nhà / đồi -> bay tới chỗ thấy lần cuối
            && (!this.missileLosOk || this.missileLosOk(shooter, target))));
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
      let ay = P.y + Math.min(26, dh * 0.04);
      // TẤN CÔNG ĐỈNH: leo vồng cao trên mục tiêu, còn cách ~DIVE thì bổ nhào gần thẳng đứng vào nóc xe (giáp mỏng nhất)
      if (G.top && G.loft) {
        // VỒNG CAO (bệ đột nóc xe tăng, G.loft): vút lên gần thẳng tới đỉnh vồng, chỉ bổ nhào khi đã lên đủ cao và mục tiêu
        // lọt vào vòng bổ nhào theo độ cao đang có -> lao gần thẳng đứng (~60-75°) xuống nóc, kể cả mục tiêu khá gần
        const L = G.loft, apex = Math.min(L.max, L.base + dh * L.k), hAbove = s.y - P.y;
        if (!G.climbed && hAbove >= apex * 0.8) G.climbed = true;
        // chưa lên tới đỉnh mà mục tiêu đã sát (xe địch lao lại gần): bổ nhào luôn từ độ cao đang có, đỡ bay vượt qua đầu
        const late = !G.climbed && hAbove > 40 && dh <= hAbove * 1.1;
        if (!G.dive && !((G.climbed && dh <= Math.max(L.minDive, hAbove * L.diveK)) || late)) ay = P.y + apex;
        else { G.dive = true; ay = P.y + (L.aimY || 0); }
      } else if (G.top) {
        const DIVE = 85;
        if (!G.dive && dh > DIVE) ay = P.y + Math.min(125, 30 + dh * 0.34);
        else { G.dive = true; ay = P.y - 90; }   // chúc dốc (~60-70°) xuống nóc
      }
      const hx = ax - s.x, hz = az - s.z, hl = Math.hypot(hx, hz) || 1;
      // Bám địa hình: dò mặt đất phía trước theo hướng tới mục tiêu (bán kính vòng ~380 đơn vị nên phải nhìn xa),
      // chọn độ dốc lớn nhất cần để vượt mọi gò / bờ đất cách mặt đất >= 13 đơn vị
      let slope = (ay - s.y) / hl;
      if (G.loft && !G.climbed && !G.dive) slope = Math.max(slope, G.loft.climb);   // vút lên dốc đứng ngay sau khi đánh lửa
      if (terrain && !G.dive) {
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
      const maxA = G.turnAcc * (s.timeAlive - cold < (G.boostT || 0.3) ? 0.5 : 1);
      const dtv = Math.max(dt, 1e-4) / newSp;
      const needH = Math.hypot(cx, cz) / dtv, needV = Math.abs(cy) / dtv;
      const kh = needH > maxA ? maxA / needH : 1, kv = needV > maxA * 4 ? maxA * 4 / needV : 1;
      ux += cx * kh; uy += cy * kv; uz += cz * kh;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
    }
    s.vx = ux * newSp; s.vy = uy * newSp; s.vz = uz * newSp;
  }

  // Drone đang bay (airTargets) của xe chủ có id ownerId — null: drone đã rơi / hạ cánh / không còn trên trời
  airTargetOf(ownerId) {
    for (const T of this.airTargets || []) if (T.dr && T.dr.owner && T.dr.owner.id === ownerId) return T;
    return null;
  }

  /**
   * Tên lửa đánh drone, DẪN THEO TIA LASER từ kính ngắm xe bắn: tên lửa không có đầu dò riêng, kính ngắm trên xe bám
   * drone và truyền lệnh lái tới điểm đón đầu (bộ bám đo được vận tốc drone). Mất tia (xe bị diệt, xạ thủ hy sinh / chui
   * vào xe, drone khuất / quá cao — airBeamOk do game cấp) hoặc drone rơi -> bay thẳng tới hết tầm rồi tự hủy.
   * Không bám địa hình kiểu đánh xe (lao xuống sát đất): chỉ giữ tối thiểu AIR_FLOOR trên mặt đất khi drone bay thấp.
   * Đủ tốc độ hành trình thì cánh lái quay gắt hơn (AIR_TURN_MUL) để kịp bám drone lượn
   */
  guideAirMissile(s, dt, allUnits, terrain) {
    const G = s.guide;
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const accel = G.cruise / Math.max(0.05, G.boostT || 0.3);
    const newSp = Math.min(G.cruise, sp + accel * dt);
    let ux = s.vx / sp, uy = s.vy / sp, uz = s.vz / sp;
    let T = null;
    if (!G.lost) {
      let shooter = null;
      if (allUnits) for (const u of allUnits) if (u.id === s.shooterId) { shooter = u; break; }
      T = this.airTargetOf(G.airOwner);
      const why = !T ? 'gone' : (s.timeAlive > 0.15 && (!shooter || shooter.isDead)) ? 'shooter'
        : (shooter && this.airBeamOk && !this.airBeamOk(shooter, T.dr)) ? 'beam' : null;
      if (why) {
        G.lost = true;
        if (this.onAirMissileLost) this.onAirMissileLost(s, why);
      }
    }
    if (!G.lost && T) {
      const tv = T.dr || {};
      // điểm đón đầu: lặp 2 lần thời gian bay còn lại theo vận tốc drone
      let px = T.x, py = T.y, pz = T.z;
      for (let k = 0; k < 2; k++) {
        const tgo = Math.hypot(px - s.x, py - s.y, pz - s.z) / Math.max(1, newSp);
        px = T.x + (tv.wvx || 0) * tgo; py = T.y + (tv.wvy || 0) * tgo; pz = T.z + (tv.wvz || 0) * tgo;
      }
      G.point = { x: T.x, y: T.y, z: T.z };
      const hx = px - s.x, hz = pz - s.z, hl = Math.hypot(hx, hz) || 1;
      let slope = (py - s.y) / hl;
      if (terrain) {
        // drone bay thấp: không lao xuống sát đất (còn xa thì giữ AIR_FLOOR, sát drone mới hạ thấp hơn)
        const floor = BallisticsSystem3D.AIR_FLOOR * (hl > 60 ? 1 : 0.35);
        const ey = terrain.getElevationAt(px, pz) + floor;
        if (py < ey) slope = Math.max(slope, (ey - s.y) / hl);
        // gò đồi trên đường bay: ngóc lên vượt qua (như tên lửa đánh xe)
        for (const d of [20, 45, 80, 130, 200, 290, 400]) {
          if (d > hl - 30) break;
          const gx = s.x + hx / hl * d, gz = s.z + hz / hl * d;
          const need = (terrain.getElevationAt(gx, gz) + floor - s.y) / d;
          if (need > slope) slope = need;
        }
        const gh = s.y - terrain.getElevationAt(s.x, s.z);
        if (hl > 60 && gh < floor) slope = Math.max(slope, (floor - gh) / 40);
      }
      let wx = hx / hl, wy = slope, wz = hz / hl;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl; wy /= wl; wz /= wl;
      const cx = wx - ux, cy = wy - uy, cz = wz - uz;
      const boosting = s.timeAlive < (G.boostT || 0.3);
      const maxA = G.turnAcc * (boosting ? 0.5 : sp >= G.cruise * 0.9 ? BallisticsSystem3D.AIR_TURN_MUL : 1);
      const dtv = Math.max(dt, 1e-4) / newSp;
      const needH = Math.hypot(cx, cz) / dtv, needV = Math.abs(cy) / dtv;
      const kh = needH > maxA ? maxA / needH : 1, kv = needV > maxA * 4 ? maxA * 4 / needV : 1;
      ux += cx * kh; uy += cy * kv; uz += cz * kh;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
    }
    s.vx = ux * newSp; s.vy = uy * newSp; s.vz = uz * newSp;
  }

  /**
   * Ngòi nổ cận đích của tên lửa đánh drone: đoạn bay vừa rồi đi qua trong AIR_FUZE quanh tâm drone (kể cả bay vụt
   * qua giữa 2 bước) -> điểm nổ { x, y, z, d, target }. Ngòi hoạt động độc lập với dẫn đường (mất tia vẫn nổ nếu bay sát)
   */
  /**
   * Radar APS: đoạn bay vừa rồi đi vào vùng chặn APS_R quanh tâm một xe địch có APS còn lượt, theo hướng sẽ trúng xe
   * (đường bay kéo dài đi qua trong APS_MISS quanh tâm) -> { unit, x, y, z } điểm đạn chạm mép vùng chặn. Mỗi xe chỉ xét
   * một lần cho mỗi viên (s._apsTried); viên bắn ra khi đã ở sát xe (trong APS_MIN) thì radar không kịp
   */
  apsScan(s, x0, y0, z0, units) {
    const EQ = typeof Equipment !== 'undefined' && Equipment.apsLeft ? Equipment : null;
    if (!EQ || !units) return null;
    const R = BallisticsSystem3D.APS_R, ex = s.x - x0, ey = s.y - y0, ez = s.z - z0, L2 = ex * ex + ey * ey + ez * ez;
    if (L2 < 1e-6) return null;
    const L = Math.sqrt(L2);
    for (const u of units) {
      if (!u || u.isDead || u._netHidden || u._netStale || u.id === s.shooterId || (s.shooterTeam && u.team === s.shooterTeam)) continue;
      if (Math.abs(u.x - s.x) > R + L || Math.abs(u.z - s.z) > R + L) continue;
      if (s._apsTried && s._apsTried.has(u.id)) continue;
      if (EQ.apsLeft(u) <= 0) continue;
      const cx = u.x, cy = (u.y || 0) + 9, cz = u.z;
      const fx = x0 - cx, fy = y0 - cy, fz = z0 - cz;
      const c0 = fx * fx + fy * fy + fz * fz - R * R;
      let t;
      if (c0 <= 0) {
        // đã ở trong vùng chặn từ đầu đoạn: viên vừa bắn ra sát xe -> không kịp; còn lại (vùng chặn vừa có xe chạy tới) chặn tại chỗ
        if (fx * fx + fy * fy + fz * fz < BallisticsSystem3D.APS_MIN * BallisticsSystem3D.APS_MIN) { (s._apsTried || (s._apsTried = new Set())).add(u.id); continue; }
        t = 0;
      } else {
        const b = fx * ex + fy * ey + fz * ez, disc = b * b - L2 * c0;
        if (disc < 0) continue;
        t = (-b - Math.sqrt(disc)) / L2;
        if (t < 0 || t > 1) continue;
      }
      const px = x0 + ex * t, py = y0 + ey * t, pz = z0 + ez * t;
      // hướng bay có cắt thân xe không (đường thẳng kéo dài từ điểm vào vùng chặn)
      const dx = ex / L, dy = ey / L, dz = ez / L, wx = cx - px, wy = cy - py, wz = cz - pz, along = wx * dx + wy * dy + wz * dz;
      if (along <= 0) continue;
      const mx = wx - dx * along, my = wy - dy * along, mz = wz - dz * along;
      if (mx * mx + my * my + mz * mz > BallisticsSystem3D.APS_MISS * BallisticsSystem3D.APS_MISS) continue;
      (s._apsTried || (s._apsTried = new Set())).add(u.id);
      return { unit: u, x: px, y: py, z: pz };
    }
    return null;
  }

  // Rocket giàn xe trinh sát (s.aaFuze): ngòi cận đích không chọn mục tiêu — nổ cạnh drone ĐỊCH nào bay sát đường bay
  airFuze(s, x0, y0, z0) {
    if (s.timeAlive < 0.1) return null;
    const G = s.guide, owner = G && G.airOwner !== undefined && G.airOwner !== null ? G.airOwner : null;
    if (owner === null && !s.aaFuze) return null;
    const list = owner !== null ? [this.airTargetOf(owner)] : (this.airTargets || []);
    const sx = s.x - x0, sy = s.y - y0, sz = s.z - z0, L2 = sx * sx + sy * sy + sz * sz;
    let best = null;
    for (const T of list) {
      if (!T || (owner === null && s.shooterTeam && T.team === s.shooterTeam)) continue;
      let t = L2 > 1e-6 ? ((T.x - x0) * sx + (T.y - y0) * sy + (T.z - z0) * sz) / L2 : 1;
      t = Math.max(0, Math.min(1, t));
      const cx = x0 + sx * t, cy = y0 + sy * t, cz = z0 + sz * t;
      const d = Math.hypot(cx - T.x, cy - T.y, cz - T.z);
      if (d <= BallisticsSystem3D.AIR_FUZE && (!best || t < best.t)) best = { x: cx, y: cy, z: cz, d, t, target: T };
    }
    return best;
  }

  // Một bước bay của đạn không điều khiển: gió, lực cản (k theo quãng đường), trọng lực thế giới thu nhỏ.
  // Đạn phản lực (RPG) còn cháy động cơ thì lực đẩy bù cản & phần lớn trọng lực.
  /**
   * Một bước bay h (giây mô phỏng) — DÙNG CHUNG cho đạn thật, đạn dự đoán (đường nét đứt / bộ giải ngắm) và bù trễ mạng,
   * nên điểm rơi dự đoán trùng điểm rơi thật bất kể tốc độ khung hình.
   * - Lực cản tính theo vận tốc SO VỚI KHÔNG KHÍ (v - gió): gió bạt đạn đúng vật lý. Trước đây vận tốc ngang bị kéo
   *   về vận tốc gió với hệ số cố định = thêm một lực cản tuyến tính rất lớn (kể cả khi lặng gió) -> lựu pháo chỉ
   *   bay ~2150 thay vì ~2700 như thiết kế, góc bắn xa nhất tụt về ~33°.
   * - Tích phân điểm giữa (bậc 2): bước dự đoán lớn (0.11 s) vẫn chỉ lệch vài đơn vị so với đạn thật bước nhỏ
   *   (Euler bậc 1 trước đây làm đạn dự đoán rơi ngắn ~30 đơn vị ở tầm 2000).
   * Gọi xong, nơi gọi cộng vị trí như cũ: s.x += s.vx * h — vị trí đã được bù trước để tổng dịch chuyển = v_giữa·h.
   */
  integrateFlight(s, h) {
    const burning = s.burnTravel && (s.travel || 0) < s.burnTravel;
    let k = burning ? 0 : (s.k !== undefined ? s.k : this.dragCoeff * (s.dragMul || 1));
    // lựu pháo: không khí loãng dần lên cao (thang mật độ hRho) -> cản giảm theo e^(-độ cao / hRho) tính từ điểm bắn
    if (s.hRho && k) { const hh = s.y - (s.y0 !== undefined ? s.y0 : s.y); if (hh > 0) k *= Math.exp(-hh / s.hRho); }
    // động cơ rocket đang cháy: lực đẩy dọc trục bù cản & giữ tốc độ, nhưng trọng lực vẫn kéo đủ (trước đây x0,25 — đạn bay
    // gần như không rơi trong 500 m đầu)
    const g = s.g !== undefined ? s.g : this.gravityFor(s.ammoType, s.isDirectFire);
    // vận tốc đạn ở đây theo "giây mô phỏng" (= giây thật x bulletSpeedMultiplier) -> gió (đv / giây thật, HUD ghi M/S) cũng
    // phải chia cùng hệ số. Trước đây cộng thẳng: gió thổi mạnh gấp 3,2 lần con số hiển thị. Lựu pháo: thêm tỉ lệ gió riêng
    // (windMul) theo tỉ lệ tầm / thời gian của lựu pháo
    const w = this.wind, wk = (s.windMul || 1) / (this.bulletSpeedMultiplier || 1), wx = ((w && w.vx) || 0) * wk, wz = ((w && w.vz) || 0) * wk;
    // RPG / rocket khi động cơ còn cháy: thân có cánh đuôi quay mũi NGƯỢC VÀO gió ngang (lực đẩy theo mũi kéo đạn lệch về
    // phía gió thổi tới) — hết liều thì trôi xuôi gió như đạn thường
    if (burning && s.wc && (wx || wz)) {
      const sp = Math.hypot(s.vx, s.vz) || 1, ux = s.vx / sp, uz = s.vz / sp, along = wx * ux + wz * uz;
      const cx = wx - along * ux, cz = wz - along * uz;
      s.vx -= s.wc * cx * h; s.vz -= s.wc * cz * h;
    }
    // gia tốc đầu bước (cản theo vận tốc so với gió + trọng lực) -> vận tốc giữa bước -> gia tốc giữa bước
    let ax = s.vx - wx, az = s.vz - wz, d = k * Math.sqrt(ax * ax + s.vy * s.vy + az * az) * h * 0.5;
    const mx = s.vx - d * ax, my = s.vy - d * s.vy - g * h * 0.5, mz = s.vz - d * az;
    ax = mx - wx; az = mz - wz; d = k * Math.sqrt(ax * ax + my * my + az * az) * h;
    s.vx -= d * ax; s.vy -= d * my + g * h; s.vz -= d * az;
    s.x += (mx - s.vx) * h; s.y += (my - s.vy) * h; s.z += (mz - s.vz) * h;
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
    // Máy chậm (khung hình dài): thêm bước phụ để mỗi bước <= ~12 đv (mặt đất / mặt nước chỉ thử cuối bước).
    // 60 khung/s: đạn nhanh nhất (APFSDS ~27 đv/khung) vẫn đúng 3 bước như cũ -> quỹ đạo không đổi
    const frameDt = dt * this.bulletSpeedMultiplier;
    const ceilY = terrain && terrain.shotCeiling ? terrain.shotCeiling() : Infinity;

    for (let i = this.activeShells.length - 1; i >= 0; i--) {
      const s = this.activeShells[i];
      let impacted = false;
      // sơ tốc thật của viên đạn (sau khi bên bắn / gói mạng đã đặt vận tốc): mốc tính sức xuyên còn lại (penetrateEnv)
      if (s.pv0 === undefined) s.pv0 = Math.hypot(s.vx, s.vy, s.vz);
      // đạn liên thanh bắn nhiều viên trong một khung: viên bắn sớm hơn trong khung bay trước phần thời gian đã trễ
      // (s.lead, giây mô phỏng) -> dòng đạn giãn đều, không dồn cục ở máy chậm
      const fdt = s.lead > 0 ? frameDt + s.lead : frameDt;
      s.lead = 0;
      const subSteps = Math.max(3, Math.min(24, Math.ceil(Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz) * fdt / 12)));
      const subDt = fdt / subSteps;

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
        if (veg && s.timeAlive > 0.01) veg.passSegment(prevX, prevY, prevZ, s.x, s.y, s.z, s.hmg ? 'INCENDIARY_HMG' : s.aaMG ? 'MG762' : s.ammoType, this.fx);

        // Đạn Gatling cận chiến: Tiêu hao năng lượng và tan biến sau 0.6 giây (~480 mét)
        // Đạn súng / tên lửa bắn thẳng: hết tầm hiệu quả thì tự hủy (đạn vạch đường cháy hết, tên lửa tự nổ)
        s.travel += Math.hypot(s.x - prevX, s.y - prevY, s.z - prevZ);
        // Bay ra khỏi chiến trường (đạn pháo tăng bắn trượt bay tiếp vài km) -> bỏ
        if (Math.abs(s.x) > BallisticsSystem3D.fieldHalf(terrain, 'width') || Math.abs(s.z) > BallisticsSystem3D.fieldHalf(terrain, 'depth') || s.y < -400) {
          this.removeShellMesh(s, i);
          impacted = true;
          break;
        }
        // TÊN LỬA ĐÁNH DRONE / ROCKET GIÀN: ngòi cận đích — nổ trên không cạnh drone, mảnh & sức ép hạ drone (không đào hố / phá nhà
        // bên dưới: không đi qua onImpact)
        if (s.aaFuze || (s.guide && s.guide.airOwner !== undefined && s.guide.airOwner !== null)) {
          const fz = this.airFuze(s, prevX, prevY, prevZ);
          if (fz) {
            s.x = fz.x; s.y = fz.y; s.z = fz.z;
            this.removeShellMesh(s, i);
            if (this.onAirBurst) this.onAirBurst(s, fz.target, fz);
            else if (this.fx && this.fx.spawn) this.fx.spawn(s.x, s.y, s.z, 'RPG', 'AIR', {});
            impacted = true;
            break;
          }
        }
        // đạn súng: vạch đường tắt ở maxTravel nhưng đầu đạn còn bay & còn sát thương tới lifeTravel (hoặc khi chậm dưới minV)
        if (s.maxTravel && s.travel > s.maxTravel && s.lifeTravel > s.maxTravel && s.travel <= s.lifeTravel
          && !(s.minV && Math.hypot(s.vx, s.vy, s.vz) < s.minV)) {
          if (!s.tracerOut) { s.tracerOut = true; s.tracer = false; if (s.mesh) s.mesh.visible = false; }
        } else if (s.maxTravel && s.travel > s.maxTravel) {
          if ((s.ammoType === 'RPG' || s.ammoType === 'ANTI_TANK_MISSILE') && this.fx && this.fx.spawn) {
            this.fx.spawn(s.x, s.y, s.z, 'CLUSTER_SUBMUNITION', 'AIR', { charge: s.ammoType === 'ANTI_TANK_MISSILE' ? 4.5 : 0.7 });   // sóng xung kích theo đầu nổ thật
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

        // DRONE ĐỊCH TRÊN KHÔNG (game.js cập nhật airTargets mỗi khung hình): chỉ đạn súng máy / pháo 30mm liên thanh
        // (xe 6 nòng, xe trinh sát) bắn được — đạn pháo tăng / lựu pháo bay xuyên qua chỗ drone không tính.
        // Bay qua sát thân drone là trúng; sượt qua gần thì báo onAirNear một lần (tiếng đạn rít qua micro drone)
        // ĐẠN 30MM NỔ TRÊN KHÔNG (lập trình ngòi): bay tới đúng cự ly máy tính hỏa lực đã nạp thì tự nổ, phóng chùm bi
        // vonfram hình nón về phía trước — trúng drone nằm trong nón (abmBurst)
        if (s.abm && s.travel >= s.abm) {
          this.abmBurst(s);
          this.removeShellMesh(s, i);
          impacted = true;
          break;
        }
        // HỆ THỐNG ĐÁNH CHẶN CHỦ ĐỘNG (APS) của xe đích: đạn bay vào vùng radar theo hướng sẽ trúng xe -> onApsThreat
        // (game.js) gieo xác suất theo loại đạn; chặn được thì đạn bị phá nổ giữa đường, không tới được xe. Đầu nổ UAV cảm tử
        // (s.kami) sinh ngay sát điểm chạm: UAV đã bị radar xét lúc còn bay (kamikaze_uav.js kamiApsCheck)
        if (this.onApsThreat && !s.kami && !s.isHeavyArty && s.timeAlive > 0.004 && BallisticsSystem3D.APS_AMMO[s.ammoType]) {
          const ap = this.apsScan(s, prevX, prevY, prevZ, allUnits);
          if (ap && this.onApsThreat(s, ap.unit, ap)) {
            s.x = ap.x; s.y = ap.y; s.z = ap.z;
            this.removeShellMesh(s, i);
            impacted = true;
            break;
          }
        }
        if (this.airTargets && this.airTargets.length && s.timeAlive > 0.004 && BallisticsSystem3D.AIR_AMMO[s.ammoType]) {
          const ah = this.airTargetHit(s, prevX, prevY, prevZ);
          if (ah) {
            s.x = ah.x; s.y = ah.y; s.z = ah.z;
            this.removeShellMesh(s, i);
            if (this.onAirHit) this.onAirHit(s, ah.target, ah);
            impacted = true;
            break;
          }
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

        // 1. VA CHẠM MÔI TRƯỜNG DỌC ĐOẠN BAY: cứ điểm, thân / tán cây, nhà, vật cản (bao cát, đá, công sự), mặt nước, mặt đất.
        // Dò hết rồi lấy điểm chạm GẦN NHẤT trên đoạn bay (trước đây cái nào dò trước thắng dù nằm xa hơn), cắt đoạn bay tại
        // đó rồi mới xét xe -> xe đứng sau tường / gò đất không bị trúng xuyên qua vật che. Áp dụng sau phần xét xe.
        // envK: 1 cứ điểm, 2 thân cây, 3 tán cây, 4 nhà, 5 vật cản, 6 mặt nước, 7 mặt đất
        let envT = 2, envK = 0, envH = null, envWl = 0;
        const endX = s.x, endY = s.y, endZ = s.z;
        const ex = endX - prevX, ey = endY - prevY, ez = endZ - prevZ, eL2 = ex * ex + ey * ey + ez * ez || 1;
        // 1a. CỨ ĐIỂM BÊ TÔNG DƯỚI Ụ ĐẤT: quét dày theo đoạn bay (bê tông / đất đắp không bị phá, đạn nổ tại mặt chạm)
        if (s.timeAlive > 0.004 && terrain.strongholdSegmentHit) {
          const sh = terrain.strongholdSegmentHit(prevX, prevY, prevZ, endX, endY, endZ);
          if (sh) { envT = Math.max(0, ((sh.x - prevX) * ex + (sh.y - prevY) * ey + (sh.z - prevZ) * ez) / eL2); envK = 1; envH = sh; }
        }
        // 1b. THÂN CÂY chặn đạn: đạn súng găm vào thân, đạn pháo / tên lửa nổ tại thân cây.
        //     TÁN CÂY: đạn ngòi nổ chạm va cành là nổ ngay trên tán (tree burst, mảnh văng mưa xuống dưới tán);
        //     đạn không có ngòi chạm / không chạm cành thì xuyên qua tán. Lấy va chạm nào tới trước dọc đoạn bay
        if (veg && s.timeAlive > 0.01) {
          const th = veg.trunkHit ? veg.trunkHit(prevX, prevY, prevZ, endX, endY, endZ) : null;
          let cb = null, tB = 2;
          if (veg.crownBurst) {
            if (!s._burstAt) {
              if (!s._burstSeen) s._burstSeen = new Set();
              const r = veg.crownBurst(prevX, prevY, prevZ, endX, endY, endZ, s.ammoType, !!s.isHeavyArty, s.burstSeed || 0, s._burstSeen);
              if (r) s._burstAt = r;
            }
            const B = s._burstAt;
            if (B) {
              const t = ((B.x - prevX) * ex + (B.y - prevY) * ey + (B.z - prevZ) * ez) / eL2;
              if (t <= 1) { cb = B; tB = t; }
            }
          }
          if (th && th.t <= tB) { if (th.t < envT) { envT = th.t; envK = 2; envH = th; } }
          else if (cb && Math.max(0, tB) < envT) { envT = Math.max(0, tB); envK = 3; envH = cb; }
        }
        if (s.timeAlive > 0.015) {
          // NHÀ: dò chính xác theo đoạn bay vào mặt tường / sàn / mái còn đặc (đạn lọt qua lỗ thủng / ô sàn sập bay tiếp vào trong)
          if (terrain.buildingSegmentHit) {
            const bh = terrain.buildingSegmentHit(prevX, prevY, prevZ, endX, endY, endZ);
            if (bh) {
              const t = Math.max(0, ((bh.x - prevX) * ex + (bh.y - prevY) * ey + (bh.z - prevZ) * ez) / eL2);
              if (t < envT) { envT = t; envK = 4; envH = bh; }
            }
          }
          // VẬT CẢN (bao cát, đá tảng, công sự móng ngựa, đống đổ nát): dò dày theo đoạn bay, điểm nổ đúng mặt chạm
          // (trước đây nổ ở cuối đoạn = phía sau vật che -> vật che không chắn được sóng nổ cho xe núp sau)
          const wh = this.obstacleSegmentHit(terrain, prevX, prevY, prevZ, endX, endY, endZ, true, ceilY, s.hmg ? 'INCENDIARY_HMG' : s.ammoType);
          if (wh && wh.t < envT) { envT = wh.t; envK = 5; envH = wh; }
        }
        if (s.timeAlive > 0.02) {
          // RƠI XUỐNG SÔNG / HỒ: điểm cắt mặt nước trên đoạn bay (trước đây giữ x, z cuối đoạn)
          const wl = terrain.waterSurfaceAt ? terrain.waterSurfaceAt(endX, endZ) : null;
          if (wl !== null && endY <= wl) {
            const t = prevY > wl ? (prevY - wl) / (prevY - endY) : 0;
            if (t < envT) { envT = t; envK = 6; envWl = wl; }
          }
          // MẶT ĐẤT / ĐỒI NÚI: chia đôi đoạn bay tìm đúng chỗ chạm
          const groundElevation = terrain.getElevationAt(endX, endZ);
          const groundThreshold = s.isDirectFire ? (groundElevation - 0.8) : groundElevation;
          if (endY <= groundThreshold) {
            const c = this.groundCrossing(terrain, prevX, prevY, prevZ, endX, endY, endZ, s.isDirectFire ? 0.8 : 0);
            // chỗ chạm đất nằm dưới mặt nước (cuối đoạn đã lên bờ, đoạn bay cắt qua sông): đạn chạm mặt nước trước
            const wc = envK !== 6 && terrain.waterSurfaceAt ? terrain.waterSurfaceAt(c.x, c.z) : null;
            if (wc !== null && c.y < wc && prevY > wc) {
              const t = (prevY - wc) / (prevY - endY);
              if (t < envT) { envT = t; envK = 6; envWl = wc; }
            } else if (c.t < envT) {
              envT = c.t; envK = 7;
              envH = this._envG || (this._envG = { x: 0, y: 0, z: 0 });
              envH.x = c.x; envH.y = c.y; envH.z = c.z;
            }
          }
        }
        // cắt đoạn bay tại điểm chạm môi trường gần nhất: phần xét xe bên dưới chỉ xét đoạn trước điểm đó
        if (envK === 6) { s.x = prevX + ex * envT; s.y = envWl; s.z = prevZ + ez * envT; }
        else if (envK) { s.x = envH.x; s.y = envH.y; s.z = envH.z; }

        // 2. KIỂM TRA ĐẠN NỔ KHI ĐẾN GẦN MỤC TIÊU (PROXIMITY FUZE / HITBOX COLLISION DETECTION)
        // Chỉ kích nổ nếu không có tường chắn phía trước
        if (s.timeAlive > 0.015 && allUnits) {
          let hitVehicle = null;
          let minHitDist = Infinity;
          let prox = null;       // đạn HE bay sượt sát thân xe địch: ngòi cận đích kích nổ tại prox.t trên đoạn bay

          const segX = s.x - prevX;
          const segY = s.y - prevY;
          const segZ = s.z - prevZ;
          const segLenSq = segX * segX + segY * segY + segZ * segZ;

          for (const unit of allUnits) {
            // máy chủ không gửi vị trí / quá lâu không có gói mới: bản sao chỉ là phỏng đoán -> không tính va chạm (chống trúng "bóng ma")
            if (unit._netHidden || unit._netStale) continue;
            if (s._penU && s._penU.indexOf(unit.id) >= 0) continue;   // xe viên đạn vừa xuyên thấu (penetrateUnit)
            // Chỉ phát nổ với xe đối phương (không kích nổ vào xe của chính mình hoặc đồng đội)
            const isEnemy = !s.shooterTeam || unit.team !== s.shooterTeam;
            // (Xe nằm trong cứ điểm: xét như mọi xe — mái / tường / gờ bê tông đã chặn đạn bằng hình khối ở bước 1, đoạn bay đã
            // bị cắt tại mặt bê tông. Đạn bay thẳng qua miệng hầm mở thì trúng; trước đây bị "gờ hầm" chặn dù không có gì cản)
            // Xác xe còn nằm đó là vật cản thật: chặn đạn của mọi phe (chỉ va chạm sát thân, không kích nổ tiếp cận)
            const wreck = unit.isDead && unit.dmg && unit.group && unit.group.visible;
            // xe đồng đội cũng là vật rắn: đạn bay trúng thân là nổ / xuyên (không có ngòi nổ cận đích với xe phe mình)
            const friend = !unit.isDead && !isEnemy && unit.id !== s.shooterId;
            if (wreck || friend || (!unit.isDead && unit.id !== s.shooterId && isEnemy)) {
              // đạn súng máy / pháo 30mm liên thanh không có ngòi nổ cận đích: chỉ trúng khi đường đạn cắt đúng hộp thân xe
              // (trước đây bay qua trong 40 đv quanh tâm xe địch là tính trúng -> loạt đạn 6 nòng bị xe đứng gần đường đạn
              // "hút" mất, không tới được điểm ruồi đang ngắm)
              // đầu nổ UAV cảm tử (kamikaze_uav.js fireWarhead) cũng vậy: chỉ nổ khi thân UAV chạm thân xe — trước đây cắm
              // đất cách xe ~5 m vẫn tính là trúng thẳng
              // lựu pháo 155 HẠ NÒNG BẮN THẲNG cũng vậy (ngòi chạm, không có ngòi cận đích): trúng thật vào thân xe mới tính trúng
              // thẳng (trúng là hạ), bay sượt thì đi tiếp nổ dưới đất phía sau — nếu không, bán kính cận đích 40 đv (~5 m) biến
              // mọi phát lệch thành phát hạ gọn, độ tản mát của bắn thẳng không còn ý nghĩa
              // MỌI ĐẠN CÒN LẠI (xuyên động năng, đạn pháo thường, nổ lõm / tên lửa, lựu 40mm) cũng chỉ trúng thẳng khi đường đạn
              // cắt đúng hộp thân xe — trước đây bay qua trong 40 đv quanh tâm xe là tính trúng thẳng, cả mũi tên xuyên giáp không
              // thuốc nổ: phát trượt cách mép xe ~3 m vẫn bị tính như xuyên thân, độ tản mát pháo tăng gần như không còn ý nghĩa.
              // Bom con đạn chùm giữ vùng trúng cũ quanh tâm xe (số quả & sát thương mỗi quả đã cân theo đó)
              if (s.ammoType !== 'CLUSTER_SUBMUNITION' && typeof Strongholds !== 'undefined' && Strongholds.segUnitBox) {
                let tb = Strongholds.segUnitBox(unit, prevX, prevY, prevZ, prevX + segX, prevY + segY, prevZ + segZ, 1.0), onBarrel = false;
                if (tb < 0) { tb = segHitsBarrel(unit, prevX, prevY, prevZ, segX, segY, segZ); onBarrel = tb >= 0; }
                if (tb >= 0) {
                  const dh = tb * Math.sqrt(segLenSq);
                  if (dh < minHitDist) { minHitDist = dh; hitVehicle = unit; s.x = prevX + segX * tb; s.y = prevY + segY * tb; s.z = prevZ + segZ * tb; s._barrelHit = onBarrel; }
                } else if (!wreck && !friend && BallisticsSystem3D.PROX_FUZE[s.ammoType] && !(s.isHeavyArty && s.isDirectFire)) {
                  // NGÒI CẬN ĐÍCH của đạn nổ mảnh (HE pháo tăng, lựu pháo cầu vồng, đạn chùm): bay sượt sát thân xe địch mà không
                  // chạm -> nổ ngay cạnh xe ('PROXIMITY': sát thương nổ lan theo khoảng cách tới thân xe, không phải trúng thẳng)
                  const tp = this.proximityBurst(unit, prevX, prevY, prevZ, segX, segY, segZ, s.isHeavyArty ? BallisticsSystem3D.PROX_PAD_HEAVY : BallisticsSystem3D.PROX_PAD);
                  if (tp >= 0 && (!prox || tp < prox.t)) prox = { t: tp };
                }
                continue;
              }
              const targetCenterY = unit.y + (wreck ? 7 : 9);
              // Bán kính kích nổ tiếp cận của bom con: 13 với xác xe / xe đồng đội, 34 với xe địch
              const proximityRadius = wreck || friend ? 13 : (s.isDirectFire ? 40 : 34);
              const vertTolerance = wreck || friend ? 9 : 26;

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

          if (hitVehicle) {
            // mũi tên / 30mm xuyên thấu xe giáp mỏng / xác xe: ra phía bên kia rồi bay tiếp (penetrateUnit đã gọi onImpact)
            const pu = this.penetrateUnit(s, hitVehicle, onImpact, subDt, Math.min(1, minHitDist / Math.max(1e-6, Math.hypot(s.vx, s.vy, s.vz) * subDt)));
            if (pu === 'pass') continue;
            this.removeShellMesh(s, i);
            if (onImpact && pu !== 'stop') onImpact(s, 'DIRECT_HIT', hitVehicle);
            impacted = true;
            break;
          }
          if (prox) {
            s.x = prevX + segX * prox.t; s.y = prevY + segY * prox.t; s.z = prevZ + segZ * prox.t;
            this.removeShellMesh(s, i);
            if (onImpact) onImpact(s, 'PROXIMITY');
            impacted = true;
            break;
          }
        }

        // 3. KHÔNG TRÚNG XE TRƯỚC ĐÓ -> NỔ / GĂM TẠI ĐIỂM CHẠM MÔI TRƯỜNG GẦN NHẤT (đã đặt s.x, s.y, s.z ở trên)
        if (envK === 1) {
          if (envH.normal) s.hitNormal = envH.normal;
          if (s.ammoType === 'CLUSTER') { this.clusterImpactBurst(s, i, terrain, allUnits, onImpact); impacted = true; break; }
          if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, envH.type);
          impacted = true;
          break;
        }
        // ĐẠN XUYÊN QUA VẬT MỎNG RỒI BAY TIẾP (vách tôn / ván, kính cửa, thân xe con, thân cây, bao cát; mũi tên xuyên cả tường
        // nhà): hiệu ứng + phá vật tại điểm vào như trúng thường, vụn phụt ở lỗ ra, đạn đi tiếp từ điểm ra ở bước phụ sau
        if ((envK === 2 || envK === 4 || envK === 5) && this.penetrateEnv(s, envK, envH, terrain, onImpact, subDt, envT)) continue;
        if (envK === 2) {
          const th = envH;
          // pháp tuyến mặt thân cây tại điểm chạm + cây bị trúng (hiệu ứng dằm gỗ & vết đạn dán đúng thân cây)
          if (th.it) {
            const nl = Math.hypot(th.x - th.it.x, th.z - th.it.z) || 1;
            // khúc thân cây đổ nằm: trunkHit trả sẵn pháp tuyến mặt ống
            s.hitNormal = th.nx !== undefined ? { nx: th.nx, ny: th.ny, nz: th.nz } : { nx: (th.x - th.it.x) / nl, ny: 0, nz: (th.z - th.it.z) / nl };
            s.hitTree = th.it;
          }
          if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, 'TREE');
          impacted = true;
          break;
        }
        if (envK === 3) {
          if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, 'CANOPY');
          impacted = true;
          break;
        }
        if (envK === 4 || envK === 5) {
          // nhà: vật liệu tường (bê tông / gạch mộc / đá / gỗ / tôn) -> màu bụi, mảnh vỡ của hiệu ứng trúng đạn
          if (envK === 4) { s.hitNormal = { nx: envH.nx, ny: envH.ny, nz: envH.nz }; s.hitMat = envH.B && envH.B.st ? envH.B.st.mat : undefined; }
          // vật cản thép (xe con dân sự, cột cây xăng): hiệu ứng / màu vụn theo thép, không theo đá
          else if (envH.car || (envH.obstacle && envH.obstacle.mat === 'metal')) s.hitMat = 'metal';
          // tường rào: rào gỗ / tre báo kiểu BOULDER kèm vật liệu gỗ -> dăm gỗ, tiếng gỗ (tường đá / đất có kiểu riêng)
          else if (envH.fence) s.hitMat = envH.mat;
          if (s.ammoType === 'CLUSTER') { this.clusterImpactBurst(s, i, terrain, allUnits, onImpact); impacted = true; break; }
          if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, envK === 4 ? 'BUILDING' : (envH.type || 'WALL'));
          impacted = true;
          break;
        }
        // RƠI XUỐNG SÔNG / HỒ: nổ ngay dưới mặt nước (cột nước), không chui xuống đáy
        // — trừ khi chạm nước góc rất thấp: đạn nảy lên khỏi mặt nước bay tiếp (waterSkip)
        if (envK === 6) {
          if (this.waterSkip(s, envWl, prevX, prevY, prevZ)) continue;
          if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, 'WATER');
          impacted = true;
          break;
        }
        if (envK === 7) {
          // đạn xuyên / đạn súng chạm đất quá xiên: nảy khỏi mặt đất bay tiếp (groundSkip), không găm
          if (this.groundSkip(s, terrain)) continue;
          // đạn chùm chạm đất khi chưa tách (bắn thẳng / tầm gần): ngòi chạm kích liều phóng, đạn con văng ra ngay mặt đất
          // (đạn mẹ không có đầu nổ phá — trước đây nổ như một quả HE, khoét hố ~1,75 m)
          if (s.ammoType === 'CLUSTER') { this.clusterImpactBurst(s, i, terrain, allUnits, onImpact); impacted = true; break; }
          if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
          this.removeShellMesh(s, i);
          if (onImpact) onImpact(s, 'GROUND');
          impacted = true;
          break;
        }
      }

      if (impacted) continue;

      if (s.ignite && s.travel >= s.ignite) { s.ignite = 0; s.mesh.visible = true; }
      s.mesh.position.set(s.x, s.y, s.z);

      // Cập nhật hướng mũi đạn bám theo tiếp tuyến quỹ đạo bay tức thời (trục Y hướng theo vận tốc)
      const currentVMag = Math.hypot(s.vx, s.vy, s.vz);
      if (currentVMag > 0.1) {
        // vector tạm dùng chung (setFromUnitVectors không giữ tham chiếu) — tránh cấp phát 2 Vector3 / viên / khung
        const UP = this._vUp || (this._vUp = new THREE.Vector3(0, 1, 0));
        const currentDir = (this._vDir || (this._vDir = new THREE.Vector3())).set(s.vx / currentVMag, s.vy / currentVMag, s.vz / currentVMag);
        s.mesh.quaternion.setFromUnitVectors(UP, currentDir);

        // Hiệu ứng xoay tròn quanh trục viên đạn (Rifling Spin do rãnh xoắn nòng pháo)
        s.spinAngle += dt * 50.0;
        s.mesh.rotateY(s.spinAngle);
      }

      // Vệt khói xé gió và tàn lửa đuôi đạn (Tracer Trail)
      const isMissile = (s.ammoType === 'RPG' || s.ammoType === 'ANTI_TANK_MISSILE');
      s.trailTimer += dt;
      if (s.cold) {
        // tên lửa phóng nguội vừa rời ống: động cơ chưa cháy -> chưa có lửa / vệt khói
      } else if (this.fx && (isMissile || s.trailTimer >= 0.022)) {
        s.trailTimer = 0;
        // vector / gói thông tin tạm dùng chung (fx.trail đọc ngay, không giữ lại)
        const tailPos = (this._vTail || (this._vTail = new THREE.Vector3())).set(0, -(s.mesh.userData.length || 10) * 0.45, 0);
        s.mesh.localToWorld(tailPos);
        if (!s.lastTailPos) s.lastTailPos = tailPos.clone();
        // RPG hết nhiên liệu động cơ: tắt lửa đuôi, bay quán tính không còn nhả khói
        if (s.burnTravel && !s.burnedOut && (s.travel || 0) >= s.burnTravel) {
          s.burnedOut = true;
          s.mesh.traverse(o => { if (o.userData.tracer) o.visible = false; });
        }
        const TI = this._trailInfo || (this._trailInfo = { travel: 0, tracer: true, burnedOut: false, guided: false, gl: false });
        TI.travel = s.travel || 0; TI.tracer = s.tracer !== false; TI.burnedOut = !!s.burnedOut; TI.guided = !!s.guide; TI.gl = !!s.gl;
        this.fx.trail(tailPos.x, tailPos.y, tailPos.z, s.ammoType, s.lastTailPos.x, s.lastTailPos.y, s.lastTailPos.z, TI);
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

  /**
   * ĐẠN XUYÊN QUA VẬT RỒI BAY TIẾP (over-penetration): vách tôn / ván, kính cửa sổ, thân xe con, thân cây, bao cát; đạn mũi
   * tên xuyên cả tường nhà. Sức xuyên còn lại C = penLeft x (v / sơ tốc)^2 (1 = vừa rời nòng); mỗi lần xuyên tốn quãng vật
   * liệu (chia cos góc chạm) / PEN_ENV. Không đủ sức, chạm quá xiên, sàn / mái, bê tông cứ điểm, đá tảng -> false (găm / nổ
   * tại mặt chạm như cũ). Xuyên: onImpact tại điểm vào (hiệu ứng, phá nhà / cây / xe, nổ lan nhỏ — như trúng thường), vụn phụt
   * ở lỗ ra, đạn đặt ở điểm ra rồi bay tiếp. Đạn súng mất động năng (tốc độ giảm theo căn), lõi mũi tên bị mài ngắn (tốc độ
   * giảm ít, penLeft giảm); lệch hướng nhẹ, chao đảo -> cản tăng, xuyên giáp kém (penK, VehicleDamage). Ngẫu nhiên theo
   * burstSeed + số lần đã xuyên; mọi quyết định chỉ dựa vào hình khối & vật liệu -> mọi máy cùng đường bay.
   */
  penetrateEnv(s, envK, H, terrain, onImpact, subDt, envT) {
    if (s.gl || s.guide || s.isHeavyArty || s.kami || (s.pens || 0) >= 6) return false;
    const key = s.aaMG ? 'MG762' : s.hmg ? 'INCENDIARY_HMG' : s.ammoType;
    const PT = BallisticsSystem3D.PEN_ENV[key];
    if (!PT) return false;
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    if (sp < 1) return false;
    const dx = s.vx / sp, dy = s.vy / sp, dz = s.vz / sp, rod = key === 'AP';
    // mat: vật liệu · cost: phần sức xuyên (ở sơ tốc) bị tiêu · move: quãng đi thẳng trong vật tới điểm ra (+ đệm) ·
    // face: quãng tới mặt ra · quiet: bay qua không tính (lỗ ra mũi tên đã khoét sẵn)
    let mat = null, cost = 0, move = 0, face = 0, nIn = null, hitType = 'WALL', B = null, quiet = false;
    if (envK === 4) {
      B = H.B;
      if (H.part !== 'wall' || !B || !H.m) return false;   // sàn / mái: đạn dừng như cũ
      const cosI = Math.abs(dx * H.nx + dy * H.ny + dz * H.nz), pathW = (B.T || 2) / Math.max(0.2, cosI);
      face = pathW; move = pathW + 0.3;
      // Mũi tên đã xuyên vào nhà này từ ngoài: Destructibles khoét sẵn lỗ ra ở vách đối diện ngay trong phát trúng đó và sức
      // xuyên của vách ấy đã tính lúc vào -> chạm mặt trong vách đó thì bay thẳng ra (máy chưa nhận ENV_HIT vẫn thấy vách
      // nguyên: cùng một đường bay, không thêm hiệu ứng)
      if (H.inside && s._penB && s._penB.indexOf(B) >= 0) quiet = true;
      else {
        const BS = terrain.buildingSet, wm = (B.st && B.st.mat) || 'concrete';
        // ô cửa sổ / cửa kính mặt tiền (cửa cuốn kho thép thì không): kính mỏng, đạn nào cũng xuyên
        const glass = !!(BS && BS.inOpening && !(H.m.kit && H.m.kit.styleKey === 'hangarDoor') && BS.inOpening(B, H.m, H.L));
        mat = glass ? 'glass' : wm;
        if (!PT[mat] || (!glass && cosI < (BallisticsSystem3D.PEN_RIC[key] || 0.3))) return false;   // quá xiên: sượt cày rãnh
        cost = (glass ? 0.3 / Math.max(0.2, cosI) : pathW) / PT[mat];
        // mũi tên từ ngoài vào: tính luôn vách bên kia (lỗ ra ở đó do Destructibles khoét cùng phát trúng)
        if (rod && !H.inside) { if (!PT[wm]) return false; cost += pathW / PT[wm]; }
        nIn = { x: H.nx, y: H.ny, z: H.nz };
        hitType = 'BUILDING';
      }
    } else if (envK === 2) {
      // THÂN CÂY đứng (trụ tròn) / KHÚC THÂN ĐỔ NẰM: quãng xuyên = dây cung qua thân theo hướng bay
      const it = H.it;
      if (!it || !PT.trunk || !(it.trunkR > 0)) return false;
      let nx, ny, nz, len;
      if (H.nx !== undefined) {
        nx = H.nx; ny = H.ny; nz = H.nz;
        len = 2 * it.trunkR * 0.7 * Math.max(0.05, -(dx * nx + dy * ny + dz * nz));
      } else {
        const rl = Math.hypot(H.x - it.x, H.z - it.z) || 1, h2 = Math.max(0.01, dx * dx + dz * dz);
        nx = (H.x - it.x) / rl; ny = 0; nz = (H.z - it.z) / rl;
        len = 2 * it.trunkR * Math.max(0.02, -(dx * nx + dz * nz)) / h2;
      }
      mat = 'trunk'; cost = len / PT.trunk; face = len; move = len + 0.25; nIn = { x: nx, y: ny, z: nz }; hitType = 'TREE';
    } else {
      // VẬT CẢN: thân xe con dân sự, bờ bao cát, cột thép / cột bê tông mảnh (trụ mái che, cột cây xăng), khối tường công sự
      // móng ngựa / boong-ke. Đá tảng, bê tông cứ điểm dưới ụ đất, mốc địa hình, đống đổ nát: không xuyên
      const ob = H.obstacle;
      if (H.car) mat = 'car';
      else if (H.type === 'SANDBAG') mat = 'sandbag';
      else if (H.fort && H.fort.ref) mat = 'fort';
      else if (ob && ob.radius > 0 && ((ob.mat === 'metal' && ob.radius <= 4.5) || (ob.mat === 'concrete' && ob.radius <= 3))) mat = ob.mat === 'metal' ? 'pole' : 'column';
      const pk = mat === 'fort' || mat === 'column' ? 'concrete' : mat;
      if (!mat || !PT[pk] || typeof terrain.checkHorseshoeCollision !== 'function') return false;
      hitType = H.type || 'WALL';
      if (mat === 'fort') {
        // khối tường công sự = hộp dài len x cao x dày thick xoay theo tường: quãng xuyên = đoạn đạn đi trong hộp khối bị chạm
        let q = null, qd = 3;
        for (const b of H.fort.ref.blocks || []) {
          if (!b.alive || b.ax === undefined) continue;
          const ox = H.x - b.x, oz = H.z - b.z, al = ox * b.ax + oz * b.az, ac = oz * b.ax - ox * b.az;
          const dd = Math.hypot(Math.max(0, Math.abs(al) - b.len / 2), Math.max(0, Math.abs(ac) - b.thick / 2), H.y < b.y0 ? b.y0 - H.y : H.y > b.y1 ? H.y - b.y1 : 0);
          if (dd < qd) { qd = dd; q = b; }
        }
        if (!q) return false;   // mái hầm / phần khác của công sự: dừng như cũ
        // tia lùi 4 đv trước điểm chạm, cắt hộp khối trong hệ khối (u dọc tường, y, w theo bề dày)
        const ox = H.x - dx * 4 - q.x, oz = H.z - dz * 4 - q.z;
        const P0 = [ox * q.ax + oz * q.az, H.y - dy * 4, oz * q.ax - ox * q.az], D0 = [dx * q.ax + dz * q.az, dy, dz * q.ax - dx * q.az];
        const lo3 = [-q.len / 2, q.y0, -q.thick / 2], hi3 = [q.len / 2, q.y1, q.thick / 2];
        let t0 = -Infinity, t1 = Infinity;
        for (let k = 0; k < 3; k++) {
          if (Math.abs(D0[k]) < 1e-9) { if (P0[k] < lo3[k] || P0[k] > hi3[k]) return false; continue; }
          let a = (lo3[k] - P0[k]) / D0[k], b = (hi3[k] - P0[k]) / D0[k];
          if (a > b) { const tq = a; a = b; b = tq; }
          if (a > t0) t0 = a;
          if (b < t1) t1 = b;
        }
        const path = t1 - Math.max(t0, 4);
        if (!(t1 > t0) || !(path > 0)) return false;
        cost = path / PT.concrete; face = path;
        // vòng va chạm của công sự là trụ tròn bao khối (rộng hơn bề dày thật): đặt đạn ra hẳn ngoài vòng đó
        move = -1;
        for (let u = path + 0.5; u <= path + 30; u += 1) {
          const h = terrain.checkHorseshoeCollision(H.x + dx * u, H.y + dy * u, H.z + dz * u, true);
          if (!(h && h.hit && h.fort === H.fort)) { move = u + 0.3; break; }
        }
        if (move < 0) return false;   // bay dọc theo tường: vẫn trong công sự -> dừng
      } else if (mat === 'pole' || mat === 'column') {
        // cột tròn đứng: dây cung qua cột theo hướng bay (phần nằm ngang); bắn dọc trục cột (từ trên xuống) thì dừng
        const h2 = dx * dx + dz * dz;
        if (h2 < 0.04) return false;
        const fx0 = H.x - ob.x, fz0 = H.z - ob.z, bq = (fx0 * dx + fz0 * dz) / h2, disc = bq * bq - (fx0 * fx0 + fz0 * fz0 - ob.radius * ob.radius) / h2;
        const tOut = disc > 0 ? -bq + Math.sqrt(disc) : 0;
        if (!(tOut > 0)) return false;
        cost = tOut / PT[pk]; face = tOut; move = tOut + 0.3;
      } else {
        // xe con / bao cát: dò dọc hướng bay tới chỗ ra khỏi vật bằng hitTest của lớp vật thể (tra theo lưới ô — không duyệt
        // cả trăm nhà như checkHorseshoeCollision)
        const PS = terrain.propSet;
        const test = PS && typeof PS.hitTest === 'function' ? (x, y, z) => PS.hitTest(x, y, z) : (x, y, z) => terrain.checkHorseshoeCollision(x, y, z, true);
        const inside = (u) => {
          const h = test(H.x + dx * u, H.y + dy * u, H.z + dz * u);
          return !!(h && h.hit && (mat === 'car' ? h.car : h.type === 'SANDBAG'));
        };
        const maxL = Math.min(PT[mat], mat === 'car' ? 64 : 24);   // xa hơn thì chắc chắn không xuyên nổi
        let lo = 0, hi = -1;
        for (let u = 0.5; u <= maxL; u += 0.5) { if (!inside(u)) { hi = u; break; } lo = u; }
        if (hi < 0) return false;
        for (let k = 0; k < 6; k++) { const m = (lo + hi) * 0.5; if (inside(m)) lo = m; else hi = m; }
        cost = hi / PT[mat]; face = hi; move = hi + 0.3;
      }
    }
    let keep = 1;
    if (!quiet) {
      const C = (s.penLeft === undefined ? 1 : s.penLeft) * Math.min(1, Math.pow(sp / (s.pv0 || sp), 2));
      if (cost >= C * 0.95) return false;   // hết sức: găm lại trong vật (lọt ra yếu ớt cũng coi như găm)
      keep = 1 - cost / C;
    }
    const n = s.pens || 0;
    if (!quiet) {
      // điểm vào: hiệu ứng + phá vật y như trúng thường (vết đạn / lỗ thủng nhà, kính vỡ, dăm gỗ, thủng thân xe, cây rung...)
      if (envK === 4) { s.hitNormal = nIn; s.hitMat = mat === 'glass' ? B.st.mat : mat; }
      else if (envK === 2) { s.hitNormal = nIn; s.hitTree = H.it; }
      else if (mat === 'car' || mat === 'pole') s.hitMat = 'metal';
      if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
      // _penPass: game.js không báo "đạn va tường và phát nổ" cho phát đang xuyên qua
      s._penPass = true;
      try { if (onImpact) onImpact(s, hitType); } finally { s._penPass = false; }
      s.hitNormal = undefined; s.hitMat = undefined; s.hitTree = undefined;   // va chạm sau không mang pháp tuyến / vật liệu cũ
      if (rod && envK === 4 && !H.inside) (s._penB || (s._penB = [])).push(B);
      const fm = mat === 'fort' || mat === 'column' ? 'concrete' : mat;
      this.penExitFx(H.x + dx * face, H.y + dy * face, H.z + dz * face, dx, dy, dz, fm, rod, nIn, B);
      this.penApply(s, sp, dx, dy, dz, keep, BallisticsSystem3D.PEN_YAW[mat] || 0.75, rod);
      if (rod && n === 0 && typeof window !== 'undefined' && window.game && window.game.player && s.shooterId === window.game.player.id && window.game.addCombatLog) {
        const what = { TREE: 'thân cây', BUILDING: 'tường nhà' }[hitType] || { car: 'xe', sandbag: 'bờ bao cát', fort: 'tường công sự', pole: 'cột thép', column: 'cột bê tông' }[mat] || 'vật cản';
        window.game.addCombatLog(`[[corner-down-right]] Đạn xuyên giáp xuyên qua ${what} — bay tiếp, mất ${Math.round(cost * 100)}% sức xuyên`, 'tip');
      }
    }
    // phần còn lại của bước phụ (đạn tới điểm ra sớm hơn cuối bước): bù vào khung sau để đạn không trễ lại sau mỗi lần xuyên
    this.penPlace(s, H.x + dx * move, H.y + dy * move, H.z + dz * move, subDt * (1 - envT) - move / sp);
    return true;
  }

  // Sau mỗi lần xuyên (vật cản / xe): tốc độ & sức xuyên còn lại (keep = phần sức còn lại), lệch hướng trong nón nhỏ, chao
  // đảo (cản tăng), xuyên giáp kém đi (penK). Đạn súng mất động năng (v giảm theo căn); lõi mũi tên mài ngắn (v giảm ít,
  // penLeft giảm). yk: hệ số chao đảo theo vật liệu (PEN_YAW). Ngẫu nhiên tất định theo burstSeed + số lần đã xuyên
  penApply(s, sp, dx, dy, dz, keep, yk, rod) {
    const n = s.pens || 0;
    const ve = rod ? 0.12 : 0.5, v = sp * Math.pow(keep, ve);
    s.penLeft = (s.penLeft === undefined ? 1 : s.penLeft) * Math.pow(keep, 1 - 2 * ve);
    const R = (salt) => { let h = Math.imul((s.burstSeed || 0) ^ Math.imul(n + 13, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b), 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    const th = (1 - yk) * (rod ? 5 : 20) * R(1) * Math.PI / 180, ph = R(2) * 2 * Math.PI;
    let ux = -dz, uz = dx, ul = Math.hypot(ux, uz);
    if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const wx = dy * uz, wy = dz * ux - dx * uz, wz = -dy * ux;   // w = d x u (u nằm ngang)
    const cth = Math.cos(th), sth = Math.sin(th), a = Math.cos(ph) * sth, b = Math.sin(ph) * sth;
    s.vx = (dx * cth + ux * a + wx * b) * v; s.vy = (dy * cth + wy * b) * v; s.vz = (dz * cth + uz * a + wz * b) * v;
    const dk = 1 + (1 - yk) * (rod ? 0.6 : 2);
    if (s.k !== undefined) s.k *= dk;
    s.dragMul = (s.dragMul || 1) * dk;
    s.penK = (s.penK || 1) * keep * (rod ? Math.sqrt(yk) : yk);
    s.pens = n + 1;
  }

  // Đặt đạn ở điểm ra rồi bay tiếp ở bước phụ sau; left = thời gian còn lại của bước phụ (bù vào khung sau qua s.lead)
  penPlace(s, x, y, z, left) {
    s.x = x; s.y = y; s.z = z;
    if (left > 0) s.lead = (s.lead || 0) + left;
    if (s.mesh) {
      s.mesh.position.set(s.x, s.y, s.z);
      const vm = Math.hypot(s.vx, s.vy, s.vz);
      if (vm > 0.1) {
        const UP = this._vUp || (this._vUp = new THREE.Vector3(0, 1, 0));
        s.mesh.quaternion.setFromUnitVectors(UP, (this._vDir || (this._vDir = new THREE.Vector3())).set(s.vx / vm, s.vy / vm, s.vz / vm));
      }
    }
  }

  /**
   * ĐẠN XUYÊN THẤU XE GIÁP MỎNG / XÁC XE: mũi tên APFSDS (và 30mm ở cự ly gần vào xe vỏ mỏng) chui qua thành vỏ, khoang, thành
   * bên kia rồi bay tiếp — xe trinh sát, pháo tự hành, xe 6 nòng bị bắn ngang ở cự ly gần, xác các xe đó. Xe tăng chủ lực
   * không bao giờ bị xuyên thấu. Quãng thép quy đổi = 2 thành sườn (bắn ngang) hoặc mũi + đuôi (bắn dọc) theo
   * VehicleDamage.ARMOR_MM + phần khoang (THROUGH_INNER_MM); phải dư sức hẳn (gấp đôi) mới xuyên thấu, sát ngưỡng thì đạn nằm
   * lại trong khoang (VehicleDamage tính xuyên một thành như cũ). Quyết định chỉ theo loại xe / xác / sức xuyên còn lại.
   * Trả: null = không xét (nơi gọi xử lý trúng xe như cũ) · 'stop' = đã gọi onImpact, đạn dừng (nảy khỏi giáp / bị khiên
   * chữ V làm chệch) · 'pass' = đã gọi onImpact, đạn đặt ở lỗ ra phía bên kia và bay tiếp
   */
  penetrateUnit(s, u, onImpact, subDt, tHit) {
    if (s.gl || s.guide || s.isHeavyArty || s.kami || s._barrelHit || (s.pens || 0) >= 6) return null;
    if (s.ammoType !== 'AP' && s.ammoType !== 'GATLING_BULLET') return null;
    const VD = typeof VehicleDamage !== 'undefined' ? VehicleDamage : null, SB = typeof Strongholds !== 'undefined' && Strongholds.segUnitBox;
    const P = VD && VD.PEN && VD.PEN[s.ammoType], A = VD && VD.ARMOR_MM && VD.ARMOR_MM[u.tankType], inner = BallisticsSystem3D.THROUGH_INNER_MM[u.tankType];
    if (!P || P.kind !== 'KE' || !A || !inner || !SB) return null;
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    if (sp < 1) return null;
    const dx = s.vx / sp, dy = s.vy / sp, dz = s.vz / sp, rod = s.ammoType === 'AP';
    const c = Math.cos(u.bodyAngle || 0), sn = Math.sin(u.bodyAngle || 0);
    const along = Math.abs(dx * sn + dz * c) / (Math.hypot(dx, dz) || 1);
    let mm = (along > 0.7 ? A.hullFront[0] + A.rear[0] : 2 * A.side[0]) + inner;
    if (u.isDead) mm *= 0.7;   // xác xe đã cháy / bung: ít thiết bị trong khoang
    const C = (s.penLeft === undefined ? 1 : s.penLeft) * Math.min(1, Math.pow(sp / (s.pv0 || sp), 2));
    const cost = mm / P.mm;
    if (cost * 2 > C) return null;
    // lỗ ra: dò ngược hộp thân xe từ phía bên kia (cùng hộp đã dùng để xét trúng)
    const fx0 = s.x + dx * 140, fy0 = s.y + dy * 140, fz0 = s.z + dz * 140;
    const tb = SB(u, fx0, fy0, fz0, s.x, s.y, s.z, 1.0);
    if (tb < 0) return null;
    const ex = fx0 + (s.x - fx0) * tb, ey = fy0 + (s.y - fy0) * tb, ez = fz0 + (s.z - fz0) * tb;
    s._ric = false;
    if (s.mesh) s.mesh.position.set(s.x, s.y, s.z);
    if (onImpact) onImpact(s, 'DIRECT_HIT', u);
    if (s._ric) return 'stop';   // game.js: đạn nảy khỏi giáp nghiêng / khiên chữ V làm chệch -> không xuyên thấu
    (s._penU || (s._penU = [])).push(u.id);
    this.penUnitExitFx(u, ex, ey, ez, dx, dy, dz, rod);
    const n = s.pens || 0;
    this.penApply(s, sp, dx, dy, dz, 1 - cost / C, BallisticsSystem3D.PEN_YAW.vehicle, rod);
    if (n === 0 && typeof window !== 'undefined' && window.game && window.game.player && s.shooterId === window.game.player.id && window.game.addCombatLog) {
      window.game.addCombatLog(`[[corner-down-right]] ${rod ? 'Mũi tên xuyên giáp' : 'Đạn 30mm'} xuyên thấu ${u.isDead ? 'xác xe' : (u.name || 'xe')} — ra phía bên kia, bay tiếp`, 'tip');
    }
    const move = Math.hypot(ex - s.x, ey - s.y, ez - s.z) + 0.6;
    this.penPlace(s, ex + dx * 0.6, ey + dy * 0.6, ez + dz * 0.6, subDt * (1 - tHit) - move / sp);
    return 'pass';
  }

  // Lỗ ra trên vỏ phía bên kia xe bị xuyên thấu (dò tia ngược từ ngoài vào mặt vỏ) + chùm mảnh thép phụt ra theo hướng bay.
  // Chỉ là hình — không ảnh hưởng đường bay / trạng thái đồng bộ
  penUnitExitFx(u, x, y, z, dx, dy, dz, rod) {
    const F = this.fx;
    if (!F) return;
    try {
      const h = F.raycastUnit ? F.raycastUnit(u, { x, y, z, vx: -dx, vy: -dy, vz: -dz, ammoType: 'AP' }) : null;
      const geo = !!(h && h.object && h.faceIndex !== undefined);
      if (geo && F.addSurfaceMark) F.addSurfaceMark(h.point, h.normal, h.object, 'penetration', rod ? 2.6 : 1.8, { unit: u });
      if (F.spallCone) F.spallCone(geo ? h.point.clone() : new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz), rod ? 28 : 12, { spread: 0.4, speed: rod ? 1 : 0.7 });
    } catch (e) { /* hiệu ứng phụ */ }
  }

  // Lỗ ra phía sau vật bị xuyên (x, y, z = điểm trên mặt ra, d = hướng bay): mũi tên phụt chùm mảnh nóng đỏ + vụn vật liệu
  // (spallCone); đạn súng: dăm gỗ / vụn tôn / cát nhỏ phụt theo hướng bay, tôn / thân xe tóe tia lửa, không chớp lửa.
  // Vách nhà bị đạn súng xuyên: vết lỗ ra trên mặt trong (mũi tên: Destructibles đã khoét thủng cả bề dày). Chỉ là hình
  // (Math.random) — không ảnh hưởng đường bay / trạng thái đồng bộ
  penExitFx(x, y, z, dx, dy, dz, mat, rod, nIn, B) {
    const F = this.fx;
    if (!F) return;
    const dust = BallisticsSystem3D.PEN_DUST[mat] || [0.62, 0.6, 0.56];
    try {
      if (rod && F.spallCone) {
        F.spallCone(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz), mat === 'glass' ? 10 : 30, { spread: 0.42, dust: mat === 'glass' ? null : dust });
      } else {
        const r = (lo, hi) => lo + Math.random() * (hi - lo);
        if ((mat === 'metal' || mat === 'car' || mat === 'pole') && F.streaks) {
          for (let i = 0; i < 4; i++) {
            const s = r(160, 340);
            F.streaks.add({ x, y, z, vx: (dx + r(-0.35, 0.35)) * s, vy: (dy + r(-0.2, 0.4)) * s, vz: (dz + r(-0.35, 0.35)) * s, drag: 1.4, grav: 78.5, life: r(0.12, 0.3), tail: r(0.02, 0.04) });
          }
        }
        if (mat !== 'glass' && F.hardRocks) {
          for (let i = 0; i < 4; i++) {
            const s = r(30, 90);
            F.hardRocks.add({ x, y, z, vx: (dx + r(-0.45, 0.45)) * s, vy: (dy + r(-0.1, 0.5)) * s, vz: (dz + r(-0.45, 0.45)) * s, size: r(0.15, 0.4), life: r(1.5, 3), c: [dust[0] * 0.8, dust[1] * 0.8, dust[2] * 0.8] });
          }
        }
        if (F.smoke) {
          for (let i = 0; i < 3; i++) {
            const s = r(14, 40);
            F.smoke.add({ x, y, z, vx: dx * s + r(-4, 4), vy: dy * s + r(-1, 4), vz: dz * s + r(-4, 4), size: r(0.8, 1.6), grow: 3.5, drag: 2.6, grav: 2, life: r(0.7, 1.4), alpha: mat === 'glass' ? 0.2 : 0.42, fadeIn: 0.02, c0: dust, cell: 2 });
          }
        }
      }
      if (B && nIn && !rod && mat !== 'glass') {
        const P = new THREE.Vector3(x - dx * 0.05, y - dy * 0.05, z - dz * 0.05);
        if (mat === 'metal' && F.wallHoles) F.wallHoles.add(P.x, P.y, P.z, -nIn.x, 0, -nIn.z, 0.45, null);
        else if (F.addWallPit) F.addWallPit(P, new THREE.Vector3(-nIn.x, -nIn.y, -nIn.z), false, B.WM && B.WM.edge);
      }
    } catch (e) { /* hiệu ứng phụ */ }
  }

  /**
   * ĐẠN NẢY TRÊN MẶT NƯỚC (như ném thia lia): chạm nước dưới góc tới hạn thì lực nâng thủy động đẩy đạn bật lên.
   * Góc tới hạn ~ 18° / √(khối lượng riêng đạn / nước) (công thức Birkhoff): thép ~6°, mũi tên vonfram dài ~5°, đạn súng ~7°.
   * - Đạn xuyên giáp động năng & đạn súng (không ngòi nổ): dưới góc tới hạn là nảy; gần góc tới hạn nảy hay không tùy phát
   * - Đạn nổ phá / đa năng bắn thẳng (ngòi chạm): ngòi thường vẫn kích nổ khi đập nước, chỉ thỉnh thoảng sượt quá thấp
   *   ngòi không ăn -> nảy đi rồi nổ ở chỗ chạm kế tiếp
   * - Đạn nổ lõm (ngòi áp điện), đạn chùm, lựu pháo bắn cầu vồng: luôn nổ (góc rơi lớn / ngòi cực nhạy)
   * Sau khi nảy: mất 12-40% tốc độ, góc bật lên nhỏ hơn góc tới, lệch hướng vài độ, đạn chao đảo (cản tăng) -> trúng xe
   * sau khi nảy thì xuyên kém hẳn (skipMul). Ngẫu nhiên lấy từ burstSeed (gửi kèm sự kiện bắn) -> mọi máy nảy giống hệt.
   * Trả true nếu đạn đã nảy (đặt lại vị trí / vận tốc), false nếu đạn đâm xuống nước như cũ.
   */
  /**
   * Đạn xuyên động năng (APFSDS) / đạn súng chạm ĐẤT góc quá thấp: nảy khỏi mặt đất bay tiếp như ngoài đời. Ngưỡng theo mặt
   * đất: đất mềm ~5° (mũi tên cày vào đất, hiếm nảy; đạn súng găm), đất cứng / sườn đá / nhựa đường / bê tông ~11° với mũi
   * tên, ~15° với đạn súng. Nảy: phản xạ qua pháp tuyến mặt đất (kể cả sườn dốc), góc bật thấp hơn góc tới, mất 15-45% tốc
   * độ, lệch hướng vài độ, chao đảo (cản tăng, xuyên kém). Ngẫu nhiên tất định theo phát bắn -> mọi máy cùng đường bay
   */
  groundSkip(s, terrain) {
    const am = s.ammoType;
    const bullet = am === 'GATLING_BULLET' || am === 'SCOUT_BULLET' || am === 'INCENDIARY';
    const kinetic = am === 'AP' && !s.isHeavyArty;
    if (!bullet && !kinetic) return false;
    const n = s.gskips || 0;
    if (n >= 2) return false;
    const sp = Math.hypot(s.vx, s.vy, s.vz);
    if (sp < (bullet ? 150 : 250)) return false;
    const e = 2, G = (px, pz) => terrain.getElevationAt(px, pz);
    const gx = (G(s.x + e, s.z) - G(s.x - e, s.z)) / (2 * e), gz = (G(s.x, s.z + e) - G(s.x, s.z - e)) / (2 * e);
    const nl = Math.hypot(gx, 1, gz), Nx = -gx / nl, Ny = 1 / nl, Nz = -gz / nl;
    const vn = (s.vx * Nx + s.vy * Ny + s.vz * Nz) / sp;
    if (vn >= 0) return false;
    const graze = Math.asin(Math.min(1, -vn)) * 180 / Math.PI;
    const pal = this.fx && this.fx.surfacePalette ? this.fx.surfacePalette(s.x, s.z, 'GROUND') : null;
    const mat = pal && pal.mat;
    const hardS = mat === 'rock' || mat === 'hard' || mat === 'asphalt';
    if (bullet && !hardS) return false;
    const crit = hardS ? (bullet ? 15 : 11) : 5;
    const ratio = graze / crit;
    const p = ratio < 0.7 ? 1 : ratio > 1.2 ? 0 : (1.2 - ratio) / 0.5;
    const R = (salt) => { let h = Math.imul((s.burstSeed || 0) ^ Math.imul(n + 7, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b), 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    if (R(1) >= p) return false;
    const vin = { x: s.vx, y: s.vy, z: s.vz };
    const keep = hardS ? 0.7 + 0.15 * R(2) : 0.55 + 0.15 * R(2);
    const vnA = vn * sp;
    let rx = s.vx - 2 * vnA * Nx, ry = s.vy - 2 * vnA * Ny, rz = s.vz - 2 * vnA * Nz;
    const rn = rx * Nx + ry * Ny + rz * Nz, damp = 0.35 + 0.3 * R(3);   // bật lên thấp hơn góc tới
    rx -= rn * (1 - damp) * Nx; ry -= rn * (1 - damp) * Ny; rz -= rn * (1 - damp) * Nz;
    const yaw = (R(4) - 0.5) * 2 * (bullet ? 8 : 4) * Math.PI / 180, c = Math.cos(yaw), sn = Math.sin(yaw);
    const rx2 = rx * c - rz * sn, rz2 = rx * sn + rz * c, L = Math.hypot(rx2, ry, rz2) || 1, v = sp * keep;
    s.vx = rx2 / L * v; s.vy = ry / L * v; s.vz = rz2 / L * v;
    const gy = G(s.x, s.z);
    s.y = gy + 0.3;
    if (s.k !== undefined) s.k *= bullet ? 1.8 : 1.5;
    s.dragMul = (s.dragMul || 1) * (bullet ? 1.8 : 1.5);
    s.gskips = n + 1;
    s.skipMul = (s.skipMul || 1) * (bullet ? 0.5 : 0.35);
    if (this.fx && this.fx.groundSkipFx) this.fx.groundSkipFx(s.x, gy, s.z, am, vin, { x: s.vx, y: s.vy, z: s.vz }, pal);
    if (s.mesh) {
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.vx, s.vy, s.vz).normalize());
    }
    if (typeof window !== 'undefined' && window.game && window.game.player && s.shooterId === window.game.player.id && kinetic && window.game.addCombatLog) {
      window.game.addCombatLog('[[corner-down-right]] Đạn xuyên chạm đất góc quá thấp — NẢY khỏi mặt đất, bay tiếp', 'tip');
    }
    return true;
  }

  waterSkip(s, wl, px, py, pz) {
    const am = s.ammoType;
    const bullet = am === 'GATLING_BULLET' || am === 'SCOUT_BULLET' || am === 'INCENDIARY';
    const kinetic = am === 'AP' && !s.isHeavyArty;
    const fuzed = (am === 'NORMAL' || am === 'HE') && s.isDirectFire && !s.isHeavyArty;
    if (!bullet && !kinetic && !fuzed) return false;
    const n = s.skips || 0;
    if (n >= (bullet ? 3 : 2)) return false;
    const hv = Math.hypot(s.vx, s.vz), sp = Math.hypot(hv, s.vy);
    if (s.vy >= 0 || hv < 1 || sp < (bullet ? 150 : 250)) return false;
    const graze = Math.atan2(-s.vy, hv) * 180 / Math.PI;
    const crit = bullet ? 7 : kinetic ? 5.5 : 6;
    const ratio = graze / crit;
    let p = ratio < 0.7 ? 1 : ratio > 1.25 ? 0 : (1.25 - ratio) / 0.55;
    if (fuzed) p *= ratio < 0.6 ? 0.45 : 0.15;
    // số ngẫu nhiên tất định theo phát bắn & lần nảy
    const R = (salt) => { let h = Math.imul((s.burstSeed || 0) ^ Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b), 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    if (R(1) >= p) return false;
    // điểm chạm mặt nước trên đoạn bay
    const t = py > s.y ? Math.max(0, Math.min(1, (py - wl) / (py - s.y))) : 1;
    const x = px + (s.x - px) * t, z = pz + (s.z - pz) * t;
    const vin = { x: s.vx, y: s.vy, z: s.vz };
    const keep = bullet ? 0.6 + 0.18 * R(2) : kinetic ? 0.8 + 0.1 * R(2) : 0.74 + 0.14 * R(2);
    const out = Math.max(0.3, graze * (0.45 + 0.4 * R(3))) * Math.PI / 180;
    const yaw = Math.atan2(s.vz, s.vx) + (R(4) - 0.5) * 2 * (bullet ? 6 : 3) * Math.PI / 180;
    const v = sp * keep;
    s.vx = Math.cos(yaw) * Math.cos(out) * v;
    s.vz = Math.sin(yaw) * Math.cos(out) * v;
    s.vy = Math.sin(out) * v;
    s.x = x; s.z = z; s.y = wl + 0.05;
    // đạn chao đảo / lộn vòng sau khi nảy: cản không khí tăng, trúng xe thì xuyên kém
    if (s.k !== undefined) s.k *= bullet ? 1.8 : kinetic ? 1.5 : 1.15;
    s.dragMul = (s.dragMul || 1) * (bullet ? 1.8 : kinetic ? 1.5 : 1.15);
    s.skips = n + 1;
    s.skipMul = (s.skipMul || 1) * (bullet ? 0.5 : kinetic ? 0.35 : 0.85);
    if (this.fx && this.fx.waterSkip) this.fx.waterSkip(x, wl, z, am, vin, { x: s.vx, y: s.vy, z: s.vz });
    if (s.mesh) {
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.vx, s.vy, s.vz).normalize());
    }
    if (typeof window !== 'undefined' && window.game && window.game.player && s.shooterId === window.game.player.id && !bullet && window.game.addCombatLog) {
      window.game.addCombatLog('[[ripple]] Đạn chạm nước góc quá thấp — NẢY khỏi mặt nước, bay tiếp', 'tip');
    }
    return true;
  }

  // Đoạn bay (prev -> hiện tại) đi qua drone địch nào trong bán kính trúng: trả { target, x, y, z } (điểm gần nhất)
  // airTargets: [{ x, y, z (tâm thân), r (bán kính trúng), nearR (bán kính đạn rít qua), team, ... }]
  abmBurst(s) {
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1, dx = s.vx / sp, dy = s.vy / sp, dz = s.vz / sp;
    if (this.fx && this.fx.spawn) { try { this.fx.spawn(s.x, s.y, s.z, 'GATLING_BULLET', 'AIR', {}); } catch (e) { /* hiệu ứng phụ */ } }
    const A = typeof DroneAir !== 'undefined' && DroneAir.C.ABM ? DroneAir.C.ABM : { reach: 40, cone: 0.18, base: 3 };
    const R = typeof DroneAir !== 'undefined' ? DroneAir.C.HIT_R : 4.5;
    for (const T of this.airTargets || []) {
      const rx = T.x - s.x, ry = T.y - s.y, rz = T.z - s.z;
      const along = rx * dx + ry * dy + rz * dz;
      if (along < -R || along > A.reach) continue;
      const lat = Math.hypot(rx - dx * along, ry - dy * along, rz - dz * along);
      if (lat > A.base + Math.max(0, along) * A.cone + R) continue;
      // trong nón bi: sát thương mảnh (h.d > HIT_R -> FRAG_K phát trúng)
      if (this.onAirHit) this.onAirHit(s, T, { target: T, x: T.x, y: T.y, z: T.z, d: R + 1 });
    }
  }

  airTargetHit(s, x0, y0, z0) {
    const sx = s.x - x0, sy = s.y - y0, sz = s.z - z0, L2 = sx * sx + sy * sy + sz * sz;
    let best = null, bd = Infinity;
    for (const T of this.airTargets) {
      // drone phe mình / của chính mình cũng trúng đạn bay xuyên qua (không miễn nhiễm cùng phe)
      let t = L2 > 1e-6 ? ((T.x - x0) * sx + (T.y - y0) * sy + (T.z - z0) * sz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = x0 + sx * t, cy = y0 + sy * t, cz = z0 + sz * t;
      const d = Math.hypot(cx - T.x, cy - T.y, cz - T.z);
      if (d <= T.r && d < bd) {
        // dl: khoảng cách gần nhất của ĐƯỜNG ĐẠN (kéo dài) tới tâm — bước đạn thường kết thúc ngay khi vừa lọt vùng trúng nên
        // d ~ sát rìa; dl mới cho biết viên đi xuyên giữa thân hay sượt cánh (đạn Mk211: drone_air HEIAP_CORE)
        let tl = L2 > 1e-6 ? ((T.x - x0) * sx + (T.y - y0) * sy + (T.z - z0) * sz) / L2 : 0;
        const dl = Math.hypot(x0 + sx * tl - T.x, y0 + sy * tl - T.y, z0 + sz * tl - T.z);
        bd = d; best = { target: T, x: cx, y: cy, z: cz, d, dl: Math.min(d, dl) };
      }
      else if (T.nearR && d <= T.nearR && this.onAirNear) {
        const seen = s._airNear || (s._airNear = new Set());
        if (!seen.has(T)) { seen.add(T); this.onAirNear(s, T, d); }
      }
    }
    return best;
  }

  // NGÒI CẬN ĐÍCH (đạn HE): đường bay qua đoạn (x0,y0,z0)+(sx,sy,sz), kéo dài thẳng về hai phía, lọt vùng kích nổ quanh hộp
  // thân xe (đệm pad) mà phía trước không chạm thân xe -> nổ ở giữa quãng nằm trong vùng (chỗ sát thân xe nhất).
  // Trả về t (0..1 trên đoạn hiện tại) nếu điểm nổ rơi vào đoạn này; -1: không lọt vùng / sẽ chạm thân (ngòi chạm lo) /
  // điểm nổ còn ở phía trước (chờ bước sau) / đạn sinh ra đã qua điểm đó (bắn từ sát xe địch: không tự nổ ngay đầu nòng)
  proximityBurst(unit, x0, y0, z0, sx, sy, sz, pad) {
    const SB = Strongholds.segUnitBox, LOOK = BallisticsSystem3D.PROX_LOOK;
    const L = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (L < 1e-6) return -1;
    const ux = sx / L, uy = sy / L, uz = sz / L;
    const fx = x0 + ux * (L + LOOK), fy = y0 + uy * (L + LOOK), fz = z0 + uz * (L + LOOK);
    if (SB(unit, x0, y0, z0, fx, fy, fz, 1.0) >= 0) return -1;
    const bx = x0 - ux * LOOK, by = y0 - uy * LOOK, bz = z0 - uz * LOOK, tot = L + 2 * LOOK;
    const tin = SB(unit, bx, by, bz, fx, fy, fz, pad);
    if (tin < 0) return -1;
    const tout = 1 - SB(unit, fx, fy, fz, bx, by, bz, pad);
    const t = ((tin + tout) * 0.5 * tot - LOOK) / L;
    return t > 1 || t < -0.02 ? -1 : Math.max(0, t);
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
   * MÔ PHỎNG MỘT PHÁT BẮN từ (x,y,z) với vận tốc đầu (vx,vy,vz) — dùng chung cho điểm rơi dự đoán, đường nét đứt
   * và bộ giải ngắm. Cùng bước vật lý với đạn thật (integrateFlight).
   * opts: { points: true -> trả danh sách điểm vẽ đường đạn; ammo: loại đạn (đạn chùm: ghi lại điểm đạn mẹ tách vỏ) }
   * hitType: GROUND / WALL / OUT (bay ra khỏi chiến trường — đạn thật bị hủy ở đó, không có điểm rơi)
   */
  simulateShot(x, y, z, vx, vy, vz, rp, isDirectFire, terrain, opts = null) {
    const h = 0.035 * this.bulletSpeedMultiplier;
    const s = { x, y, z, vx, vy, vz, k: rp.k, g: rp.g, burnTravel: rp.burnTravel || 0, travel: 0, y0: y, hRho: rp.hRho || 0, wc: rp.wc || 0, windMul: rp.windMul || 1 };
    const pts = opts && opts.points ? [new THREE.Vector3(x, y, z)] : null;
    const cluster = !!(opts && opts.ammo === 'CLUSTER');
    const limX = BallisticsSystem3D.fieldHalf(terrain, 'width'), limZ = BallisticsSystem3D.fieldHalf(terrain, 'depth');
    // Trên "trần" bản đồ (cao hơn mọi mặt đất / vật cản) không thể va chạm -> bỏ qua kiểm tra (xem terrain.shotCeiling)
    const ceilY = terrain && terrain.shotCeiling ? terrain.shotCeiling() : Infinity;
    const off = isDirectFire ? 0.8 : 0;
    let t = 0, maxAltitude = y, hitType = 'GROUND', burst = null, water = false;
    // cây của CHÍNH địa hình đang mô phỏng (địa hình giả phẳng của bộ giải / bãi thử không có cây)
    const veg = terrain && terrain.trees && terrain.trees.trunkHit ? terrain.trees : null;
    const maxSteps = Math.ceil(2400 / this.bulletSpeedMultiplier);
    for (let step = 0; step < maxSteps; step++) {
      t += h;
      const px0 = s.x, py0 = s.y, pz0 = s.z;
      this.integrateFlight(s, h);
      s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
      if (s.burnTravel) { const tx = s.x - px0, ty = s.y - py0, tz = s.z - pz0; s.travel += Math.sqrt(tx * tx + ty * ty + tz * tz); }
      if (s.y > maxAltitude) maxAltitude = s.y;
      if (pts && (step % 2 === 0 || step < 6)) pts.push(new THREE.Vector3(s.x, s.y, s.z));
      if (Math.abs(s.x) > limX || Math.abs(s.z) > limZ) { hitType = 'OUT'; break; }
      // cả đoạn bước nằm trên trần mới bỏ qua (trước đây chỉ xét cuối bước: đoạn vừa vượt trần có thể sượt nóc vật cản)
      if ((s.y >= ceilY && py0 >= ceilY) || !terrain) continue;
      // Va chạm dọc đoạn bước (~30-60 đv): dò hết rồi lấy điểm chạm GẦN NHẤT trên đoạn như đạn thật (updateShells3D)
      // — trước đây cái nào dò trước thắng (nhà phía sau bao cát vẫn được tính là chỗ chạm)
      const ex = s.x - px0, ey = s.y - py0, ez = s.z - pz0, eL2 = ex * ex + ey * ey + ez * ez || 1;
      let hT = 2, hX = 0, hY = 0, hZ = 0, hK = null;
      // Bê tông / ụ đất cứ điểm: quét theo cả đoạn bay như đạn thật (bước mô phỏng ~50 đv lọt qua mái dày 26 đv; bắn từ
      // trong hầm thì đạn đã vượt qua mái trước mốc 0,06 s) -> dự đoán & máy tính hỏa lực biết nòng có bắn lọt ra miệng hầm
      if (t > 0.004 && terrain.strongholdSegmentHit) {
        const sh = terrain.strongholdSegmentHit(px0, py0, pz0, s.x, s.y, s.z);
        if (sh) { hT = Math.max(0, ((sh.x - px0) * ex + (sh.y - py0) * ey + (sh.z - pz0) * ez) / eL2); hX = sh.x; hY = sh.y; hZ = sh.z; hK = sh.type === 'WALL' ? 'WALL' : 'GROUND'; }
      }
      // THÂN CÂY chặn đạn như đạn thật (tán cây nổ trên tán theo xác suất từng phát: không dự đoán)
      if (t > 0.01 && veg && veg.trunkHit) {
        const th = veg.trunkHit(px0, py0, pz0, s.x, s.y, s.z);
        if (th && th.t < hT) { hT = th.t; hX = th.x; hY = th.y; hZ = th.z; hK = 'WALL'; }
      }
      // NHÀ: dò theo cả đoạn bay như đạn thật (trước đây chỉ thử điểm cuối mỗi bước ~30-50 đv -> lọt qua nhà mỏng: bộ giải
      // tưởng đường bắn thẳng thông, lựu pháo không chuyển sang cầu vồng, đường đạn dự kiến vẽ xuyên qua nhà)
      if (t > 0.015 && terrain.buildingSegmentHit) {
        const bh = terrain.buildingSegmentHit(px0, py0, pz0, s.x, s.y, s.z);
        if (bh) {
          const tb = Math.max(0, ((bh.x - px0) * ex + (bh.y - py0) * ey + (bh.z - pz0) * ez) / eL2);
          if (tb < hT) { hT = tb; hX = bh.x; hY = bh.y; hZ = bh.z; hK = 'WALL'; }
        }
      }
      // bao cát / đá / công sự / đống đổ nát: dò dày theo đoạn bước (trước đây chỉ thử cuối bước -> lọt bao cát mỏng);
      // nhà còn đứng đã dò ở trên (skipBuildings)
      if (t > 0.06) {
        const wh = this.obstacleSegmentHit(terrain, px0, py0, pz0, s.x, s.y, s.z, !!terrain.buildingSegmentHit, ceilY, opts && opts.ammo);
        if (wh && wh.t < hT) { hT = wh.t; hX = wh.x; hY = wh.y; hZ = wh.z; hK = 'WALL'; }
      }
      const gy = terrain.getElevationAt(s.x, s.z);
      // Đạn chùm: đạn mẹ tách vỏ ở ~165 trên mặt đất khi đang lao xuống (cùng điều kiện với đạn thật)
      if (cluster && !burst && !hK && s.vy < -12 && t > 0.3 && s.y - gy <= 165) burst = { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz };
      if (t > 0.02) {
        // MẶT NƯỚC: đạn thật nổ ngay mặt nước (không chui xuống đáy sông) -> điểm rơi tại chỗ cắt mặt nước
        const wl = terrain.waterSurfaceAt ? terrain.waterSurfaceAt(s.x, s.z) : null;
        if (wl !== null && wl !== undefined && s.y <= wl) {
          const tw = py0 > wl ? (py0 - wl) / (py0 - s.y) : 0;
          if (tw < hT) { hT = tw; hX = px0 + ex * tw; hY = wl; hZ = pz0 + ez * tw; hK = 'GROUND'; water = true; }
        }
        // Chạm mặt đất / đồi núi: chia đôi đoạn bay tìm đúng chỗ chạm
        if (s.y <= gy - off) {
          const c = this.groundCrossing(terrain, px0, py0, pz0, s.x, s.y, s.z, off);
          const wc = !water && terrain.waterSurfaceAt ? terrain.waterSurfaceAt(c.x, c.z) : null;
          if (wc !== null && wc !== undefined && c.y < wc && py0 > wc) {
            // chỗ chạm đất nằm dưới mặt nước (đoạn bước cắt qua sông rồi mới lên bờ): chạm mặt nước trước
            const tw = (py0 - wc) / (py0 - s.y);
            if (tw < hT) { hT = tw; hX = px0 + ex * tw; hY = wc; hZ = pz0 + ez * tw; hK = 'GROUND'; water = true; }
          } else if (c.t < hT) { hT = c.t; hX = c.x; hY = c.y; hZ = c.z; hK = 'GROUND'; water = false; }
        }
      }
      if (hK) { s.x = hX; s.y = hY; s.z = hZ; hitType = hK; break; }
    }
    if (pts) pts.push(new THREE.Vector3(s.x, s.y, s.z));
    return { x: s.x, y: s.y, z: s.z, time: t, maxAltitude, hitType, burst, points: pts, water };
  }

  // Vị trí miệng nòng + vận tốc đầu (chưa tản mát) của một phát bắn: lấy từ nòng 3D thật nếu có, không thì từ góc lệnh
  launchState(shooterX, shooterY, shooterZ, azimuth, elevation, v0, shooterObj, fallbackPivot = true) {
    if (shooterObj && typeof shooterObj.getMuzzleWorldTransform === 'function') {
      const m = shooterObj.getMuzzleWorldTransform();
      return { x: m.position.x, y: m.position.y, z: m.position.z, vx: m.direction.x * v0, vy: m.direction.y * v0, vz: m.direction.z * v0 };
    }
    const elRad = elevation * (Math.PI / 180), azRad = azimuth * (Math.PI / 180);
    const vh = v0 * Math.cos(elRad);
    const o = { vx: vh * Math.sin(azRad), vy: v0 * Math.sin(elRad), vz: -vh * Math.cos(azRad) };
    const bg = shooterObj && shooterObj.barrel;
    if (bg && bg.fwd !== undefined) {
      // Miệng nòng = trục tháp + gốc nòng (quay theo hướng bắn) + nòng dài len nghiêng theo góc el
      const ux = Math.sin(azRad), uz = -Math.cos(azRad), rx = -uz, rz = ux;
      const reach = bg.fwd + Math.cos(elRad) * bg.len;
      o.x = shooterX + bg.axX + ux * reach + rx * bg.lat;
      o.z = shooterZ + bg.axZ + uz * reach + rz * bg.lat;
      o.y = shooterY + bg.pivotH + Math.sin(elRad) * bg.len;
    } else if (bg) {
      // Miệng nòng = tâm quay nòng + nòng dài len nghiêng theo góc el
      const reach = bg.pivotFwd + Math.cos(elRad) * bg.len;
      o.x = shooterX + Math.sin(azRad) * reach; o.z = shooterZ - Math.cos(azRad) * reach;
      o.y = shooterY + bg.pivotH + Math.sin(elRad) * bg.len;
    } else if (fallbackPivot) {
      o.x = shooterX + Math.sin(azRad) * 40; o.z = shooterZ - Math.cos(azRad) * 40;
      o.y = shooterY + 18 + Math.sin(elRad) * 40;
    } else {
      o.x = shooterX; o.y = shooterY + 18; o.z = shooterZ;
    }
    return o;
  }

  /**
   * Tính toán tự động điểm rơi đạn pháo mô phỏng vật lý thời gian thực
   * Giúp xạ thủ biết trước điểm rơi chính xác khi xoay nòng, nâng hạ nòng hoặc đổi liều phóng
   */
  predictTrajectoryImpact(shooterX, shooterY, shooterZ, azimuth, elevation, chargeLevel, terrain, shooterObj = null, ammoOverride = null) {
    const ammo = ammoOverride || (shooterObj && shooterObj.selectedAmmo) || 'NORMAL';
    const isDirectFire = this.isDirectFireShot(ammo, elevation);
    const rp = this.roundParams(ammo, shooterObj, chargeLevel);
    const L = this.launchState(shooterX, shooterY, shooterZ, azimuth, elevation, rp.v0, shooterObj);
    const r = this.simulateShot(L.x, L.y, L.z, L.vx, L.vy, L.vz, rp, isDirectFire, terrain, { ammo });
    return {
      impactX: r.x,
      impactY: r.y,
      impactZ: r.z,
      distance: Math.round(Math.hypot(r.x - shooterX, r.z - shooterZ)),
      flightTime: Math.round(r.time * 10) / 10,
      maxAltitude: Math.round(r.maxAltitude),
      hitType: r.hitType,
      burst: r.burst,
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
    const L = this.launchState(shooter ? shooter.x : 0, shooter ? shooter.y : 0, shooter ? shooter.z : 0, azimuth, elevation, rp.v0, shooter, false);
    const r = this.simulateShot(L.x, L.y, L.z, L.vx, L.vy, L.vz, rp, isDirectFire, terrain, { points: true, ammo });
    let hitType = r.hitType === 'GROUND' && isDirectFire ? 'DIRECT_AIM' : r.hitType;
    // Đạn súng / rocket tự hủy khi hết tầm bay (maxTravel): đường dự kiến dừng ở điểm tự hủy, không có điểm rơi (trước đây
    // vẽ cả quỹ đạo tới lúc chạm đất -> rocket giàn ngóc nòng hiện một vòng cung dài mà đạn thật đã nổ giữa trời).
    // Quả lựu 40mm bay tới khi chạm (shell.maxTravel = 0), tên lửa dẫn đường không theo đường này
    const gl = !!(shooter && shooter.mainGun && shooter.mainGun.kind === 'agl');
    const cap = !rp.guided && !gl && rp.maxTravel > 0 ? rp.maxTravel : 0;
    let ip = new THREE.Vector3(r.x, r.y, r.z), selfDestruct = false;
    if (cap && r.points && r.points.length > 1) {
      let acc = 0;
      for (let i = 1; i < r.points.length; i++) {
        const seg = r.points[i].distanceTo(r.points[i - 1]);
        if (acc + seg >= cap) {
          ip = r.points[i - 1].clone().lerp(r.points[i], (cap - acc) / Math.max(1e-6, seg));
          r.points.length = i;
          r.points.push(ip.clone());
          hitType = 'OUT'; selfDestruct = true;
          break;
        }
        acc += seg;
      }
    }
    return {
      selfDestruct,
      points: r.points,
      impactPoint: ip,
      distance: Math.round(Math.hypot(ip.x - L.x, ip.z - L.z)),
      hitType,
      burst: r.burst,
      flightTime: r.time,
      maxAltitude: Math.round(r.maxAltitude)
    };
  }

  /**
   * Tính toán giải pháp ngắm bắn tự động tối ưu tới mục tiêu (Auto-Aiming Calculator)
   * Tìm góc tà elevation chuẩn xác nhất tới điểm đích với sơ tốc pháo tiêu chuẩn
   */
  /**
   * Pháo bắn thẳng: góc nòng (thế giới, độ) để đường đạn đi qua đúng điểm 3D (x, y, z) — giữa thân xe địch, mặt tường,
   * điểm dưới tâm kính — thay vì rơi xuống mặt đất tại (x, z). Hướng tính từ trục quay tháp, đã bù gió bạt ngang.
   * Trả về { el, az } hoặc null.
   * (Bộ giải theo điểm mặt đất coi đường tới chân xe đâm vào gò trước mặt trong khi đường tới thân xe vẫn thông.)
   */
  elevationThrough(P, x, y, z, terrain, hintEl) {
    if (!P || !this.calculateTrajectoryPoints) return null;
    const bo = BallisticsSystem3D.boreOrigin(P);
    const d = Math.hypot(x - bo.x, z - bo.z);
    if (d < 6) return null;
    // az: hướng bắn đã bù gió bạt ngang (máy tính hỏa lực đo gió) — chỉnh dần cùng góc nòng ở vòng lặp dưới
    let az = (Math.atan2(x - bo.x, -(z - bo.z)) * 180 / Math.PI + 360) % 360;
    const ux = (x - bo.x) / d, uz = (z - bo.z) / d;
    const elMax = this.maxElevationFor ? this.maxElevationFor(P) : 30;
    // Mô phỏng với ĐÚNG góc đang thử: xe thật có getMuzzleWorldTransform -> launchState lấy hướng nòng HIỆN TẠI, bỏ qua
    // az / el truyền vào -> lời giải phụ thuộc chỗ nòng đang chĩa. Bản sao: miệng nòng ở đúng vị trí thật nhưng hướng
    // bắn theo góc đang thử
    const M0 = typeof P.getMuzzleWorldTransform === 'function' ? P.getMuzzleWorldTransform() : null;
    // miệng nòng ở đúng chỗ nó sẽ tới khi tháp đã quay về hướng az (xoay quanh trục tháp): nòng dài ~40 đv, tháp đang chĩa
    // hướng khác (bot giải trước rồi mới quay tháp) thì lấy vị trí miệng nòng hiện tại lệch ngang cả chục đơn vị
    let mpos = M0 ? M0.position : null;
    const mlen = M0 ? Math.hypot(M0.position.x - bo.x, M0.position.z - bo.z) : 0;
    const placeMuzzle = () => {
      if (!M0) return;
      const ar = az * Math.PI / 180;
      mpos = new THREE.Vector3(bo.x + Math.sin(ar) * mlen, M0.position.y, bo.z - Math.cos(ar) * mlen);
    };
    placeMuzzle();
    const Q = Object.create(P);
    let trial = 0;
    Q.getMuzzleWorldTransform = M0 ? () => {
      const er = trial * Math.PI / 180, ar = az * Math.PI / 180;
      return { position: mpos, direction: new THREE.Vector3(Math.sin(ar) * Math.cos(er), Math.sin(er), -Math.cos(ar) * Math.cos(er)) };
    } : null;
    let el = typeof hintEl === 'number' ? hintEl : Math.atan2(y - ((P.y || 0) + 20), d) * 180 / Math.PI;
    for (let k = 0; k < 4; k++) {
      el = Math.max(-10, Math.min(elMax, el));
      trial = el;
      const tj = this.calculateTrajectoryPoints(Q, az, el, P.charge, terrain);
      const pts = tj && tj.points;
      if (!pts || pts.length < 2) return { el, az };
      let yAt = null, dEnd = 0, yEnd = 0, lat = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const da = Math.hypot(a.x - bo.x, a.z - bo.z), db = Math.hypot(b.x - bo.x, b.z - bo.z);
        dEnd = db; yEnd = b.y;
        if (db >= d) {
          const t = db > da ? (d - da) / (db - da) : 1;
          yAt = a.y + (b.y - a.y) * t;
          // gió bạt ngang: đạn qua cự ly d lệch sang phải (+) / trái (-) đường nhìn tới điểm ngắm
          lat = (a.x + (b.x - a.x) * t - x) * -uz + (a.z + (b.z - a.z) * t - z) * ux;
          break;
        }
      }
      // đạn dừng trước cự ly đó: sát điểm ngắm (chính bức tường / thân xe đang ngắm) là đã khớp
      if (yAt === null) { if (dEnd >= d - 8) return { el, az }; yAt = yEnd - (d - dEnd) * 0.2; }
      const corr = Math.atan2(y - yAt, d) * 180 / Math.PI;
      const corrAz = -Math.atan2(lat, d) * 180 / Math.PI;
      el += corr;
      az = (az + corrAz + 360) % 360;
      placeMuzzle();
      if (Math.abs(corr) < 0.02 && Math.abs(corrAz) < 0.02) break;
    }
    return { el: Math.max(-10, Math.min(elMax, el)), az };
  }

  solveAimingForTarget(shooterX, shooterY, shooterZ, targetX, targetZ, terrain, shooterObj = null, opts = null) {
    const dx = targetX - shooterX;
    const dz = targetZ - shooterZ;
    const dist = Math.hypot(dx, dz);
    const baseAz = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;

    // BỘ ĐỆM ĐƯỜNG NGẮM (Aim Cache): Tiết kiệm 90% chi phí tích phân Euler cho 20 xe
    if (!this._aimCache) this._aimCache = new Map();
    const cacheNow = performance.now();
    const targetY0 = terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0;
    const distKey = Math.round(dist / 3.5);
    const dyKey = Math.round((targetY0 - shooterY) / 2);
    const tType = shooterObj ? shooterObj.tankType : 'ALL';
    const tAmmo = shooterObj ? shooterObj.selectedAmmo : 'NORMAL';
    const cacheKey = `${tType}:${tAmmo}:${distKey}:${dyKey}:${opts && opts.preferLob ? 1 : 0}`;
    const cached = this._aimCache.get(cacheKey);
    if (cached && (cacheNow - cached.t < 350)) {
      return Object.assign({}, cached.res, { azimuth: baseAz });
    }
    const ux = dist > 0 ? dx / dist : 0, uz = dist > 0 ? dz / dist : -1;

    // Chọn góc nòng THẤP NHẤT mà đạn thật sự rơi tới điểm chỉ định:
    // quét nâng dần; phát nào đâm đồi / tường / nhà trước mục tiêu thì tiếp tục nâng (bắn vòng qua vật cản);
    // khi điểm rơi vượt qua mục tiêu -> chia đôi khoảng để ra nghiệm chính xác.
    // Lựu pháo: bắn cầu vồng 10..70° (đánh xa) hoặc HẠ NÒNG BẮN THẲNG (liều đầy, đạn bay căng) khi địch áp sát.
    const arty = !!(shooterObj && shooterObj.tankType === 'ARTILLERY');
    const AD = BallisticsSystem3D.ARTY_DIRECT;
    const bodyTiltEl = arty && typeof shooterObj.barrelWorldOffset === 'function' ? shooterObj.barrelWorldOffset().el : 0;
    // mainGun: vũ khí chính lắp trên chân đế mô-đun (xe trinh sát) -> mô phỏng đúng quả lựu / rocket (roundParams)
    const probe = shooterObj ? { tankType: shooterObj.tankType, selectedAmmo: shooterObj.selectedAmmo, mainGun: shooterObj.mainGun || null } : null;
    // Đạn bay ra từ miệng nòng thật: lấy độ cao / tầm với của tâm quay nòng và chiều dài nòng đo trên mô hình 3D
    // (trước đây giả định cố định cao 18, trước 40 cho mọi xe -> pháo bắn thẳng lệch điểm rơi đáng kể)
    if (probe && typeof shooterObj.barrelGeometry === 'function') {
      const bg = shooterObj.barrelGeometry();
      if (bg) probe.barrel = bg;
    }
    const tol = Math.max(8, dist * 0.012);
    // Lựu pháo: chọn liều phóng nhỏ nhất bắn tới được (đạn rơi dốc, ít mòn nòng) — thử liều lần trước trước
    // directArty: lựu pháo hạ nòng bắn thẳng (góc thấp, liều đầy)
    const solveFor = (curCharge, directArty = false, lowFloor = false) => {
      const lobArty = arty && !directArty;
      const elMax = directArty ? AD.elMax : this.maxElevationFor(shooterObj);
      // góc hạ nòng thấp nhất là giới hạn cơ khí theo THÂN XE; bộ giải tính góc trong thế giới -> cộng độ nghiêng thân xe
      // (xe đỗ chúc mũi 3° thì nòng chạm -5° trên thân xe = -8° thật). Trước đây kẹp ở -5° thật: mục tiêu sát dưới dốc
      // không bao giờ khớp, kính ngắm báo "đang xoay tháp" mãi
      // Cầu vồng từ 25°: dưới đó đường đạn nhìn gần như thẳng (người chơi chọn bắn cầu vồng mà thấy bắn thẳng). Có 7 liều
      // phóng nên ở cự ly nào cũng có liều tới được trong 25-45° mà không phải nâng nòng 55-60° (đạn bay quá lâu)
      const elMin = directArty ? this.minElevationFor(shooterObj, baseAz) + bodyTiltEl : (arty ? (lowFloor ? 10 : 25) : (shooterObj && shooterObj.tankType === 'GATLING' ? this.minElevationFor(shooterObj, baseAz) : -10));
      let az = baseAz;
      const targetY = terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0;
      const ammo = (shooterObj && shooterObj.selectedAmmo) || 'NORMAL';
      const capAmmo = shooterObj && shooterObj.tankType === 'GATLING' ? (ammo === 'INCENDIARY' ? 'INCENDIARY' : 'GATLING_BULLET') : ammo;
      const cap = this.maxTravelFor ? this.maxTravelFor(capAmmo, shooterObj) : 0;
      const shot = (el) => {
        const p = this.predictTrajectoryImpact(shooterX, shooterY, shooterZ, az, el, curCharge, terrain, probe);
        // Đạn chùm: đạn mẹ tách vỏ trên không, đạn con bị cản mạnh rơi ngắn hơn điểm chạm đất của đạn mẹ ~100-200 ->
        // ngắm cho TÂM VÙNG RẢI ĐẠN CON trùng điểm chỉ định (trước đây mục tiêu nằm ở mép xa của vùng rải)
        if (p.burst && ammo === 'CLUSTER') {
          const F = this.clusterFootprint(p.burst, terrain, true);
          if (F) { p.impactX = F.x; p.impactZ = F.z; }
        }
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
        const step = lobArty ? 2.5 : (directArty ? 1.0 : 1.5);
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
          // đủ gần nhưng chưa đổi dấu: vẫn tinh chỉnh (dây cung) tới sát điểm chỉ định — nhận ngay mẫu "đủ gần" thì mỗi lần
          // giải lại (0.5 s / lần) nòng nhảy sang một góc khác trong dung sai -> điểm rơi giật qua lại vài chục đơn vị
          if (Math.abs(p.err) < tol) {
            let a = prev || shot(el - step * 0.5), aEl = prev ? prevEl : el - step * 0.5, b = p, bEl = el;
            for (let k = 0; k < 8 && Math.abs(best.err) > Math.min(2, tol * 0.15); k++) {
              const den = b.err - a.err;
              if (Math.abs(den) < 1e-9) break;
              const m = Math.max(from, Math.min(to, bEl - b.err * (bEl - aEl) / den)), pm = shot(m);
              if (Math.abs(pm.err) < Math.abs(best.err)) { best = pm; bestEl = m; }
              a = b; aEl = bEl; b = pm; bEl = m;
            }
            found = true;
            break;
          }
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
      // xe trinh sát: chỉ súng phóng lựu bắn vồng được — giàn rocket / súng 12.7 là vũ khí bắn thẳng (giới hạn ngóc 60-70°
      // của bệ chỉ để ngắm trời bắn drone, không phải để nâng nòng bắn cầu vồng vượt vật cản)
      const scoutDirect = shooterObj && shooterObj.tankType === 'SCOUT' && !(shooterObj.mainGun && shooterObj.mainGun.kind === 'agl');
      const lobMax = scoutDirect ? elMax : this.maxLobElevationFor ? this.maxLobElevationFor(shooterObj) : elMax;
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
    // xe địch sát gần (dưới ~250): bắn thẳng thì đạn 155 nổ ngay trước mũi, mảnh văng quật lại chính xe mình -> ưu tiên
    // cầu vồng góc cao (liều siêu nhỏ, đạn rơi gần như thẳng đứng xuống mục tiêu)
    const ARTY_SAFE_DIRECT = 250;
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
      const nC = ((typeof GameTiming !== 'undefined' && GameTiming.REAL.artyCharges) || [1, 0.8, 0.62, 0.44, 0.34, 0.26, 0.2, 0.14, 0.1, 0.07]).length;
      const order = Array.from({ length: nC }, (_, i) => nC - i);   // liều nhỏ nhất trước
      const hc = opts && opts.hintCharge;
      if (hc) { order.splice(order.indexOf(hc), 1); order.unshift(hc); }
      // Liều nhỏ nhất bắn tới được Ở GÓC THẤP (<= 45°) như tổ tính phần tử bắn pháo binh: liều nhỏ chỉ với tới ở góc rất
      // cao thì đạn bay lâu gấp 1,5-2 lần và tản mát dọc lớn hơn (trước đây cự ly 1200 bay ~5,7 s, lâu hơn cả cự ly 1800).
      // Không liều nào tới ở góc thấp (vd vượt đồi gần) mới dùng góc cao
      // Liều chắc chắn không với tới: tầm xa nhất (góc 32/40/48°) xuống mặt phẳng ngang độ cao mục tiêu, không vật cản, vẫn
      // ngắn hơn hẳn cự ly -> bỏ qua, khỏi quét cả dải góc nòng (mỗi liều 25-75 lần mô phỏng đầy đủ; mục tiêu xa trước đây
      // tốn hàng trăm lần mô phỏng mỗi lần giải). Lề 12% + dung sai trúng cho gió / hướng; liều đầy (1) luôn được giải
      const ty = terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0;
      const plane = { width: 1e7, depth: 1e7, getElevationAt: () => ty };
      const shortMemo = new Map();
      const tooShort = (ch) => {
        if (ch === 1) return false;
        if (shortMemo.has(ch)) return shortMemo.get(ch);
        let reach = 0;
        for (const el of [32, 40, 48]) reach = Math.max(reach, this.predictTrajectoryImpact(shooterX, shooterY, shooterZ, baseAz, el, ch, plane, probe).distance);
        const r = reach * 1.12 + Math.max(15, dist * 0.025) < dist;
        shortMemo.set(ch, r);
        return r;
      };
      let first = null, high = null;
      for (const ch of order) {
        if (tooShort(ch)) continue;
        const r = solveFor(ch);
        if (!first || (!first.reachable && r.miss < first.miss)) first = first && first.reachable ? first : r;
        if (r.reachable && r.elevation <= 45) return r;
        if (r.reachable && !high) high = r;
      }
      // không liều nào tới được trong 25-45°: góc cao (>45°) nếu đạn bay không quá lâu (mục tiêu gần: bắn vọt lên rồi rơi
      // gần thẳng đứng xuống, vượt được gò / nhà che); bay quá lâu (10-15 s) thì chấp nhận cầu vồng thấp 10-25°
      if (high && (high.flightTime || 0) <= 8) return high;
      for (const ch of order) {
        if (tooShort(ch)) continue;
        const r = solveFor(ch, false, true);
        if (r.reachable && r.elevation <= 45) return r;
      }
      return high || first;
    };
    // Tự chọn: bắn vào xe (đã thấy, đường bắn thẳng thông) trong tầm bắn thẳng -> hạ nòng bắn thẳng trước;
    // đường thẳng bị đồi / nhà chặn thì mới nâng nòng bắn cầu vồng. Bắn điểm trên mặt đất: gần bắn thẳng, xa cầu vồng.
    // Mục tiêu trong điểm mù mũi xe: tháp không quay tới được -> báo không bắn tới (phải quay thân xe)
    const blind = this.inArtyBlind(shooterObj, baseAz);
    const fin = (r) => { if (blind && r) { r.reachable = false; r.blind = true; } return r; };
    const tries = mode === 'direct' ? [direct] : mode === 'lob' ? [lob]
      : (dist < lobMin * 1.08 || (opts && opts.atUnit && !opts.preferLob && dist <= AD.max && dist >= ARTY_SAFE_DIRECT)) ? [direct, lob] : [lob, direct];
    let first = null;
    for (const f of tries) {
      const r = f();
      if (!r) continue;
      if (r.reachable) {
        const solFin = fin(r);
        if (solFin && solFin.reachable && this._aimCache) {
          if (this._aimCache.size > 200) this._aimCache.clear();
          this._aimCache.set(cacheKey, { t: cacheNow, res: Object.assign({}, solFin) });
        }
        return solFin;
      }
      if (!first) first = r;
    }
    // không quỹ đạo nào tới: trả nghiệm của quỹ đạo ưu tiên (ngoài cự ly bắn thẳng: nghiệm thẳng gần nhất để nòng vẫn chỉ về mục tiêu)
    const finalSol = fin(first || solveFor(1, true));
    if (finalSol && finalSol.reachable && this._aimCache) {
      if (this._aimCache.size > 200) this._aimCache.clear();
      this._aimCache.set(cacheKey, { t: cacheNow, res: Object.assign({}, finalSol) });
    }
    return finalSol;
  }

  // LỰU PHÁO BẮN THẲNG: chọn góc nòng để đạn bay căng ngang TÂM THÂN XE mục tiêu (không phải chân xe trên mặt đất —
  // tầm gần nòng không hạ đủ thấp để đạn cắm đất ngay chân xe, nhưng ngòi nổ cận đích nổ khi lướt sát thân xe).
  // Kiểm tra lại bằng mô phỏng đầy đủ: đạn đâm dốc / tường / nhà trước mục tiêu thì không bắn tới.
  solveArtyDirect(shooterX, shooterY, shooterZ, targetX, targetZ, terrain, shooterObj, probe, az) {
    const AD = BallisticsSystem3D.ARTY_DIRECT;
    const dx = targetX - shooterX, dz = targetZ - shooterZ, dist = Math.hypot(dx, dz);
    const ux = dist > 0 ? dx / dist : 0, uz = dist > 0 ? dz / dist : -1;
    const offEl = shooterObj && typeof shooterObj.barrelWorldOffset === 'function' ? shooterObj.barrelWorldOffset().el : 0;
    const elMin = this.minElevationFor(shooterObj, az) + offEl, elMax = AD.elMax;
    const ty = (terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0) + 9;   // tâm thân xe
    const h = el => this.shotHeightAt(shooterY, el, 1, shooterObj, probe, dist, az);
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
    // (tâm thân +-26) để không báo "không tới" khi nòng vắt qua cabin phải nâng lên và đạn bay ngang tháp xe địch
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

  // Độ cao đường đạn khi bay tới cự ly ngang `dist` theo hướng bắn — dùng cho bắn thẳng tầm rất gần
  // az (độ): hướng bắn -> gốc nòng đặt đúng theo trục tháp (tháp đặt lệch tâm xe, vd bàn xoay lựu pháo phía sau thùng xe);
  // không có thì lấy khoảng cách gốc nòng - tâm xe như cũ (luôn coi là phía trước).
  // Cùng bước vật lý với đạn thật (integrateFlight: cản theo vận tốc so với gió, tích phân điểm giữa) — trước đây Euler
  // riêng bỏ qua gió (gió dọc hướng bắn làm đạn thật bay cao / thấp hơn dự tính)
  shotHeightAt(sy, el, charge, shooterObj, probe, dist, az) {
    const ammo = (shooterObj && shooterObj.selectedAmmo) || 'NORMAL';
    const rp = this.roundParams(ammo, shooterObj, charge);
    const elRad = el * Math.PI / 180;
    const bg = probe && probe.barrel;
    let x = bg ? bg.pivotFwd + Math.cos(elRad) * bg.len : 40;
    if (bg && bg.fwd !== undefined && typeof az === 'number') {
      const ar = az * Math.PI / 180;
      x = (bg.axX || 0) * Math.sin(ar) - (bg.axZ || 0) * Math.cos(ar) + bg.fwd + Math.cos(elRad) * bg.len;
    }
    const y0 = sy + (bg ? bg.pivotH + Math.sin(elRad) * bg.len : 18 + Math.sin(elRad) * 40);
    if (x >= dist) return y0;
    // bay trong không gian 3D theo hướng az (gió có hướng), x = cự ly ngang dọc hướng bắn
    const ar = (typeof az === 'number' ? az : 0) * Math.PI / 180, ux = Math.sin(ar), uz = -Math.cos(ar);
    const vh = rp.v0 * Math.cos(elRad);
    const s = { x: ux * x, y: y0, z: uz * x, vx: ux * vh, vy: rp.v0 * Math.sin(elRad), vz: uz * vh, k: rp.k, g: rp.g, burnTravel: rp.burnTravel || 0, travel: 0,
      y0, hRho: rp.hRho || 0, wc: rp.wc || 0, windMul: rp.windMul || 1 };
    const dt = 0.01 * (this.bulletSpeedMultiplier || 1);
    for (let i = 0; i < 4000; i++) {
      const px = s.x, py = s.y, pz = s.z;
      this.integrateFlight(s, dt);
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.burnTravel) s.travel += Math.hypot(s.x - px, s.y - py, s.z - pz);
      const nx = s.x * ux + s.z * uz;
      if (nx >= dist) {
        const ax = px * ux + pz * uz;
        return py + (s.y - py) * (dist - ax) / Math.max(1e-6, nx - ax);
      }
    }
    return null;
  }

  // Thời gian bay (giây thật) của đạn bắn thẳng tới cự ly ngang dist — có lực cản (dv/dx = -k·v -> t = (e^{k·d} - 1) / (k·v0)),
  // đoạn động cơ rocket còn cháy bay đều không cản. Cho lượng đón đầu xe đang chạy: trước đây lấy d / v0, thiếu 15-30% với
  // đạn 30mm / 12.7 / HE ở tầm xa -> đạn rơi sau xe chạy ngang hàng chục đv
  directFlightTime(ammo, shooter, dist) {
    const rp = this.roundParams(ammo, shooter, (shooter && shooter.charge) || 1);
    const v = rp.v0 * (this.bulletSpeedMultiplier || 1);
    if (!(v > 1) || !(dist > 0)) return 0;
    const burn = Math.min(dist, rp.burnTravel || 0), d = dist - burn, kd = (rp.k || 0) * d;
    return burn / v + (kd > 1e-6 ? Math.expm1(kd) / (rp.k * v) : d / v);
  }

  // Cự ly ngắn nhất bắn cầu vồng được (liều nhỏ nhất, góc nâng tối đa, mặt đất phẳng, lặng gió) — tính một lần
  artyLobMinRange() {
    if (this._artyLobMin) return this._artyLobMin;
    const flat = { getElevationAt: () => 0, checkHorseshoeCollision: () => ({ hit: false }), waterSurfaceAt: () => null };
    const probe = { tankType: 'ARTILLERY', selectedAmmo: 'HE' };
    const el = this.maxElevationFor(probe);
    const w = this.wind; this.wind = { vx: 0, vz: 0 };
    let d = 0;
    const nC = ((typeof GameTiming !== 'undefined' && GameTiming.REAL.artyCharges) || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).length;
    try { d = this.predictTrajectoryImpact(0, 0, 0, 0, el, nC, flat, probe).distance; } finally { this.wind = w; }
    return (this._artyLobMin = d || 440);
  }
}

// Tầm bay tối đa (đơn vị game) của đạn súng / tên lửa trước khi tự hủy / cháy hết vạch đường — số liệu thật x rangeScale
// (game_timing.js). Đạn pháo bay hết quỹ đạo (0).
BallisticsSystem3D.prototype.maxTravelFor = function (ammoType, shooter = null) {
  if (typeof GameTiming === 'undefined') return 0;
  // vũ khí chính trên chân đế mô-đun (xe trinh sát): tầm bay theo quả lựu / rocket thật đang lắp
  if (shooter && shooter.mainGun && shooter.mainGun.kind && (ammoType === 'SCOUT_BULLET' || ammoType === 'INCENDIARY' || ammoType === 'GATLING_BULLET')) {
    return this.roundParams(ammoType, shooter, 1).maxTravel || 0;
  }
  const type = shooter ? shooter.tankType : (ammoType === 'INCENDIARY' ? 'GATLING' : null);
  return GameTiming.round(ammoType, type).maxTravel;
};

// Tầm bắn hiệu quả tối đa hiển thị trên HUD / bản đồ / bộ giải ngắm theo loại xe (số liệu thật x rangeScale)
BallisticsSystem3D.prototype.maxRangeFor = function (shooter) {
  const GT = typeof GameTiming !== 'undefined' ? GameTiming : null;
  if (!GT) return 1700;
  const t = shooter ? shooter.tankType : 'ALL_ROUNDER';
  switch (t) {
    case 'ARTILLERY': return Math.round(GT.round('HE', 'ARTILLERY').eff);              // ~0.75 cạnh bản đồ
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
  // như xe thật: lựu pháo 70°, tháp 30mm ngóc được +60°, giá súng máy 12.7mm xe trinh sát +70° (SCOUT_HMG_EL), pháo tăng +20°
  return t === 'ARTILLERY' ? 70 : t === 'SCOUT' ? BallisticsSystem3D.scoutElMax(shooter) : t === 'GATLING' ? 60 : 20;
};
// Bệ súng 12.7 xe trinh sát (kính ngắm phát tia dẫn tên lửa cùng bệ): ngóc tới +70° — drone gần đỉnh đầu vẫn bám / bắn được.
// Lắp súng phóng lựu / giàn rocket trên chân đế: giữ +60° như trước
BallisticsSystem3D.SCOUT_HMG_EL = 70;
BallisticsSystem3D.scoutElMax = function (u) {
  return u && u.mainGun && (u.mainGun.kind === 'agl' || u.mainGun.kind === 'rocket') ? 60 : BallisticsSystem3D.SCOUT_HMG_EL;
};

// VÙNG SÁT THƯƠNG theo loại đạn (đơn vị game, 8 = 1 m): radius = bán kính nổ lan tối đa, core = vùng lõi chịu trọn sức nổ
// (ra ngoài lõi giảm dần — game.js blastFalloff).
// heavy: đạn lựu pháo 155mm (xe pháo tự hành). Dùng chung cho tính sát thương thật và vòng sát thương dự kiến trên HUD.
BallisticsSystem3D.blastProfile = function (ammoType, heavy) {
  let radius = 55;   // mặc định: đạn pháo 120mm tiêu chuẩn
  if (ammoType === 'GATLING_BULLET' || ammoType === 'SCOUT_BULLET') radius = 10;
  else if (ammoType === 'INCENDIARY') radius = 16;
  else if (ammoType === 'CLUSTER_SUBMUNITION') radius = 32;   // mảnh văng đạn con
  else if (ammoType === 'CLUSTER') radius = 85;
  else if (ammoType === 'RPG' || ammoType === 'ANTI_TANK_MISSILE') radius = 45;
  // Lựu pháo 152/155 mm (~7-11 kg thuốc nổ, vỏ thép dày vỡ thành vài nghìn mảnh): lõi ~6 m (sức ép + mảnh lớn xé thủng xe
  // vỏ mỏng, phá xích / bánh xe tăng), mảnh còn đủ sức găm thủng vỏ mỏng / phá thiết bị ngoài tới ~25 m. Trước đây 17 m / 4 m
  // — bù cho độ tản thật (dispersion ARTY_LOB): lựu pháo diệt xe bằng mảnh văng chứ hiếm khi trúng thẳng
  else if (ammoType === 'HE') radius = heavy ? 200 : 75;      // pháo HE nổ lan tương xứng uy lực
  else if (ammoType === 'AP') radius = 9;                     // đạn xuyên động năng không thuốc nổ: chỉ mảnh vỡ sát điểm chạm
  else if (heavy) radius = 200;
  const core = (heavy && ammoType !== 'AP') ? 48 : ammoType === 'HE' ? 20 : ammoType === 'NORMAL' || ammoType === 'CLUSTER' ? 16 : radius * 0.35;
  return { radius, core };
};

// Ra khỏi mép bản đồ (nửa bề rộng / bề sâu mặt đất) là đạn đã bay ra ngoài chiến trường: đạn thật bị hủy, không có điểm rơi.
// (trước đây giới hạn cố định 2300 trong khi bản đồ chỉ rộng ±1800 -> đạn "rơi" xuống khoảng trống ngoài bản đồ)
BallisticsSystem3D.FIELD_LIMIT = 2300;
// Đạn bắn được mục tiêu trên không (drone): súng liên thanh của xe 6 nòng / xe trinh sát
BallisticsSystem3D.AIR_AMMO = { GATLING_BULLET: 1, SCOUT_BULLET: 1, INCENDIARY: 1 };
// Tên lửa đánh drone (xe trinh sát): bán kính ngòi cận đích quanh tâm drone (đv), độ cao tối thiểu trên mặt đất khi bám
// drone bay thấp, hệ số cánh lái khi đã đủ tốc độ hành trình (so với lúc vừa rời ống)
BallisticsSystem3D.AIR_FUZE = 9;
// Hệ thống đánh chặn chủ động (APS): loại đạn radar giao chiến (xác suất theo loại: Equipment.apsEngageP), bán kính vùng
// chặn quanh tâm xe (~9 m), đường bay lệch tâm xe quá bấy nhiêu thì radar coi là bay trượt (không phí lượt), gần hơn
// bấy nhiêu lúc radar mới thấy (bắn sát nòng) thì không kịp phản ứng
BallisticsSystem3D.APS_AMMO = { RPG: 1, ANTI_TANK_MISSILE: 1, NORMAL: 1, HE: 1 };
// Ngòi cận đích (proximityBurst): loại đạn có ngòi, vùng kích nổ quanh hộp thân xe (đv: ~2 m với HE pháo tăng, ~3 m với
// lựu 155) và quãng kéo dài đường bay hai phía (dài hơn đường chéo vùng kích nổ lớn nhất ~160 đv) để tìm đúng điểm giữa vùng
BallisticsSystem3D.PROX_FUZE = { HE: 1, CLUSTER: 1 };
BallisticsSystem3D.PROX_PAD = 16;
BallisticsSystem3D.PROX_PAD_HEAVY = 24;
BallisticsSystem3D.PROX_LOOK = 240;
BallisticsSystem3D.APS_R = 70;
BallisticsSystem3D.APS_MISS = 30;
BallisticsSystem3D.APS_MIN = 30;
BallisticsSystem3D.AIR_FLOOR = 12;
BallisticsSystem3D.AIR_TURN_MUL = 2.2;
// ĐẠN XUYÊN QUA VẬT RỒI BAY TIẾP (penetrateEnv): quãng vật liệu (đv, 8 đv = 1 m) đạn xuyên thủng được ở sơ tốc, chạm vuông
// góc. Tường nhà theo WALLMAT (destructibles.js): tôn 0,7 · ván 1,4 · bê tông 2,2 · gạch mộc 3,2 · đá 3,6; kính cửa ~0,3;
// xe con: cả quãng xuyên qua hộp thân xe (~1,8 m ngang); bờ bao cát ~5,2 (2 lớp bao); thân cây: dây cung qua thân.
// Theo bảng bề dày che chắn thực tế (FM 5-103): 12.7 cần ~1 m gỗ sồi, ~30 cm bê tông, ~60 cm cát mới chặn được; 7.62 khoảng
// một nửa; 30mm xuyên-cháy gấp rưỡi 12.7; APFSDS 120 ~2 m bê tông (PEN_WALL game.js), cát / đá ăn mòn lõi mạnh nhất.
// Không có mục = loại đạn có ngòi nổ (nổ ngay mặt chạm), lựu pháo, tên lửa
BallisticsSystem3D.PEN_ENV = {
  SCOUT_BULLET: { metal: 14, wood: 9, glass: 60, car: 40, trunk: 6, sandbag: 4.5, adobe: 2.6, concrete: 1.6, stone: 1.2, pole: 2.4 },
  INCENDIARY_HMG: { metal: 12, wood: 8, glass: 60, car: 36, trunk: 5, sandbag: 4, adobe: 2.2, concrete: 1.4, stone: 1.0, pole: 2 },
  MG762: { metal: 7, wood: 4.5, glass: 40, car: 22, trunk: 2.6, sandbag: 2.4, adobe: 1.2, concrete: 0.7, stone: 0.5, pole: 1 },
  GATLING_BULLET: { metal: 30, wood: 16, glass: 80, car: 80, trunk: 10, sandbag: 5, adobe: 3.0, concrete: 2.0, stone: 1.6, pole: 7 },
  INCENDIARY: { metal: 26, wood: 14, glass: 80, car: 70, trunk: 8.5, sandbag: 4.4, adobe: 2.6, concrete: 1.7, stone: 1.4, pole: 6 },
  AP: { metal: 600, wood: 320, glass: 10000, car: 900, trunk: 160, sandbag: 22, adobe: 22, concrete: 16, stone: 13, pole: 400 }
};
// pole: cột thép rỗng (trụ mái che cây xăng ~0,65 m, cụm cột bơm) tính theo dây cung qua cột — thành ống 2 lần ~10 mm thép;
// cột bê tông mảnh (trụ ≤ 0,75 m) và khối tường công sự / boong-ke (1,5 m) dùng mục concrete
// XUYÊN THẤU XE (penetrateUnit): phần khoang phải đi qua ngoài 2 thành vỏ (mm thép quy đổi: động cơ, cơ cấu, cơ số đạn,
// kíp xe). Xe tăng chủ lực: khoang lớn + giáp sườn 90 mm -> mũi tên 650 mm không bao giờ đủ gấp đôi
BallisticsSystem3D.THROUGH_INNER_MM = { SCOUT: 25, ARTILLERY: 30, GATLING: 120, ALL_ROUNDER: 250 };
// cos góc chạm tường nhà dưới ngưỡng này thì đạn sượt cày rãnh, không xuyên (cùng ngưỡng ric của Destructibles BLD)
BallisticsSystem3D.PEN_RIC = { SCOUT_BULLET: 0.4, INCENDIARY_HMG: 0.4, MG762: 0.4, GATLING_BULLET: 0.36, INCENDIARY: 0.36, AP: 0.24 };
// Đạn chao đảo sau khi xuyên theo vật liệu (1 = bay thẳng như cũ): lệch hướng tối đa (1 - k) x 20° (mũi tên x 5°), cản tăng,
// xuyên giáp kém đi (penK -> VehicleDamage) — kính / tôn mỏng gần như không ảnh hưởng, cát / thân cây làm đạn lộn vòng
BallisticsSystem3D.PEN_YAW = { glass: 0.98, metal: 0.9, car: 0.8, wood: 0.8, trunk: 0.7, sandbag: 0.6, adobe: 0.7, concrete: 0.7, stone: 0.7,
  pole: 0.85, column: 0.7, fort: 0.65, vehicle: 0.8 };
// màu bụi / vụn phụt ra ở lỗ ra
BallisticsSystem3D.PEN_DUST = { metal: [0.6, 0.6, 0.58], car: [0.52, 0.52, 0.5], wood: [0.55, 0.45, 0.32], trunk: [0.5, 0.4, 0.28], glass: [0.8, 0.85, 0.88],
  sandbag: [0.72, 0.64, 0.5], adobe: [0.78, 0.68, 0.52], concrete: [0.72, 0.7, 0.66], stone: [0.7, 0.68, 0.64], pole: [0.58, 0.58, 0.56] };
BallisticsSystem3D.fieldHalf = function (terrain, dim) {
  const v = terrain && terrain[dim];
  return v > 0 ? v / 2 : BallisticsSystem3D.FIELD_LIMIT;
};

// LỰU PHÁO HẠ NÒNG BẮN THẲNG: liều đầy, góc thấp, đạn bay căng — để tự vệ khi địch áp sát (dưới tầm cầu vồng).
// min/max: cự ly bắn thẳng (đơn vị game); elMax: góc nâng cao nhất vẫn tính là bắn thẳng;
// depress: góc hạ nòng thấp nhất ra hai bên / phía sau (lựu pháo trên xe tải thật -3..-5°);
// blind: nửa góc (rad) ĐIỂM MÙ phía mũi xe — tháp không quay vào đây (nòng không vắt qua cabin, ống xả, đầu xe):
//   đo trên mô hình Arbalest: mép cabin (rộng 10.6) cách trục tháp 35.5, ống xả cao ngang trục nòng cách 29 / lệch 9.6,
//   cộng bán kính nòng + khoảng an toàn ~1 m cho sóng đầu nòng -> ~31°. Mũi xe ±31° là điểm mù, phải quay thân xe.
// Gốc đường nòng trên mặt bằng: trục quay tháp (nòng nằm trên trục giữa tháp); xe không có tháp riêng thì tâm xe
BallisticsSystem3D.boreOrigin = function (P) {
  const tg = P && P.turretGroup;
  if (!tg || typeof THREE === 'undefined') return { x: P.x, z: P.z };
  const v = BallisticsSystem3D._boreV || (BallisticsSystem3D._boreV = new THREE.Vector3());
  tg.updateWorldMatrix(true, false);
  tg.getWorldPosition(v);
  return { x: v.x, z: v.z };
};
// Độ cao điểm nhắm trên thân xe mục tiêu (so với gốc xe): ~giữa thân (30% chiều cao hộp mô hình), mặc định 9
BallisticsSystem3D.unitAimHeight = function (u) {
  // nhắm giữa khối xe (khoảng vòng tháp / giữa thân), như pháo thủ thật: trước đây 30% hộp, trần 10 -> điểm nhắm sát bánh
  // xích, vòng khóa nằm dưới tâm kính. Hộp đo cả ăng-ten / trạm súng nóc nên vẫn lấy theo tỉ lệ & có trần
  if (typeof VehicleCollision !== 'undefined' && u && u.group) { const B = VehicleCollision.hullBox(u); if (B && isFinite(B.maxY)) return Math.max(5, Math.min(13, B.maxY * 0.4)); }
  return 9;
};

BallisticsSystem3D.ARTY_DIRECT = { min: 60, max: 800, elMax: 15, depress: -5, blind: 0.55 };
// Số đạn con mỗi quả đạn chùm 155 (thật: 72-88 quả DPICM; game rút gọn) — mỗi quả yếu, sát thương đến từ số lượng
BallisticsSystem3D.CLUSTER_SUB_COUNT = 32;
// Lực văng tối đa của đạn con khi tách vỏ (đv/s): đạn mẹ lúc bung chỉ còn ~70-150 đv/s nên lực văng quyết định cỡ vùng rải.
// 75 -> 90% đạn con trong ~9-11 m: một loạt rơi đúng lấy ~30-45% máu xe tăng, ~40% xe 6 nòng, hạ gọn xe pháo / trinh sát
BallisticsSystem3D.CLUSTER_EJECT = 75;
// Xe 6 nòng: nửa góc điểm mù phía đuôi (rad) — tháp chỉ quay ±115° quanh mũi xe. Quá ~125° cụm nòng gạt qua thùng đồ
// nóc sau (mép trước thùng ở z 15.4, x 11.7..14.3 so với tâm tháp z 5) và mái lồng sàn sau; chừa ~10° cho bề ngang cụm nòng
BallisticsSystem3D.GATLING_REAR_BLIND = 65 * Math.PI / 180;

// VẬT CẢN NÒNG trên xe Arbalest (spg_arbalest.js / recon_drone.js), hệ tọa độ khung xe (mũi xe -z, nóc cabin y 22.5):
// hộp [x0, x1, z0, z1, đỉnh y]. Nòng vắt qua phía trên thì phải nâng cho mép dưới nòng cao hơn đỉnh vật cản.
// (bỏ qua ăng-ten roi: mảnh, cong được)
BallisticsSystem3D.ARTY_BARREL = {
  pivot: { y: 24.0, z: 17, off: 4.0 },   // trục nâng nòng: cao 24.0, tháp ở z 17, trục nòng lệch -4 về phía nòng
  margin: 0.2,
  // bán kính nòng theo khoảng cách từ trục nâng: giá nòng, thân, bầu hút khói (phình to nhất), thân trước, hãm lùi
  radius: d => d < 10.7 ? 2.3 : d < 31.2 ? 1.46 : d < 36.4 ? 1.85 : d < 66 ? 1.25 : 1.95,
  obstacles: [
    [-10.6, 10.6, -33.5, -19.5, 22.5],    // nóc cabin
    [-3.7, 3.7, -22.2, -21.0, 25.4],      // giá khóa nòng hành quân
    [2.4, 9.8, -30.0, -22.8, 25.7],       // đế sạc + drone trinh sát đậu (ReconDrone.DOCK x 6.1, z -26.4)
    [-6.6, -2.6, -29.0, -24.7, 23.0],     // cửa nóc + đèn quay
    [7.1, 8.1, -32.0, -31.0, 23.2],       // chân ăng-ten nóc cabin
    [8.7, 10.5, -12.9, -11.1, 23.9],      // ống xả dựng đứng + mũ chắn mưa
    [-10.5, -8.9, -13.2, -11.6, 23.2]     // ống hút gió
  ]
};

// Góc hạ nòng thấp nhất (độ) của lựu pháo theo góc tháp so với đầu xe rel (rad, 0 = qua cabin) — dùng chung cho gameplay
// & mô hình 3D: nòng vắt qua nóc cabin / khoang máy thì tự nâng vừa đủ vượt mọi thứ bên dưới, ngoài ra hạ tới depress.
// Tính theo hình học thật, nhớ theo từng nấc 0.01 rad.
BallisticsSystem3D.artyMinElevation = function (rel) {
  const AD = BallisticsSystem3D.ARTY_DIRECT, B = BallisticsSystem3D.ARTY_BARREL;
  const key = Math.round(Math.atan2(Math.sin(rel), Math.cos(rel)) * 100);
  const C = B._cache || (B._cache = new Map());
  let v = C.get(key);
  if (v !== undefined) return v;
  const r = key / 100, s = Math.sin(r), c = Math.cos(r);
  const px = -B.pivot.off * s, pz = B.pivot.z - B.pivot.off * c;   // trục nâng quay theo tháp
  const clear = (elDeg) => {
    const e = elDeg * Math.PI / 180, se = Math.sin(e), ce = Math.cos(e);
    for (let d = 0; d <= 72; d += 0.25) {
      const x = px - d * ce * s, z = pz - d * ce * c, bottom = B.pivot.y + d * se - B.radius(d) / ce;
      for (const o of B.obstacles) {
        const rr = B.radius(d);
        if (x > o[0] - rr && x < o[1] + rr && z > o[2] - rr && z < o[3] + rr && bottom < o[4] + B.margin) return false;
      }
    }
    return true;
  };
  v = AD.depress;
  while (v < AD.elMax && !clear(v)) v += 0.25;
  C.set(key, v);
  return v;
};

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
  if (shooter && shooter.tankType === 'GATLING') return BallisticsSystem3D.gatlingMinElevation(shooter, azimuthDeg);
  if (!shooter || shooter.tankType !== 'ARTILLERY') return -10;
  const AD = BallisticsSystem3D.ARTY_DIRECT;
  const az = azimuthDeg !== undefined ? azimuthDeg : (shooter.azimuth || 0);
  // cùng quy ước với tháp pháo 3D: turretGroup.rotation.y = -az - bodyAngle (0 = nòng chỉ về đầu xe, qua cabin)
  return BallisticsSystem3D.artyMinElevation(-(az * Math.PI / 180) - (shooter.bodyAngle || 0));
};

// Xe 6 nòng: khối mũi đúc cao + khiên chữ V / lưỡi ủi chắn trước -> trong cung ±35° quanh mũi cụm nòng chỉ hạ tới -3.5°
// (khiên) / -6° (lưỡi ủi / không lắp gì); ra hai bên / phía sau hạ hết -10°; chuyển dần trong 35-50° (vùng hạn chế góc hạ
// nòng như xe tăng thật). Cùng quy ước tháp: turretGroup.rotation.y = -az - bodyAngle (0 = nòng chỉ về đầu xe)
BallisticsSystem3D.gatlingMinElevation = function (shooter, azimuthDeg) {
  const az = azimuthDeg !== undefined ? azimuthDeg : (shooter.azimuth || 0);
  let rel = -(az * Math.PI / 180) - (shooter.bodyAngle || 0);
  rel = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)));
  const lim = shooter.frontId === 'vshield' ? -3.5 : -6, A = 35 * Math.PI / 180, B = 50 * Math.PI / 180;
  if (rel <= A) return lim;
  if (rel >= B) return -10;
  return lim + (-10 - lim) * (rel - A) / (B - A);
};

// BẮN THẲNG VÀO XE (opts.atUnit): nâng nòng một chút để đường đạn đi qua TÂM THÂN XE thay vì cắm đúng chân xe.
// Có độ tản mát thì nhắm chân xe = một nửa số phát cắm đất trước mục tiêu; nhắm giữa thân thì lệch lên / xuống đều còn trúng.
BallisticsSystem3D.AIM_CENTER_H = 11;   // độ cao tâm thân xe trên mặt đất (đv, ~1.4 m)
BallisticsSystem3D.prototype.aimCenterMass = function (sol, shooterY, dist, targetX, targetZ, terrain, shooterObj, probe, opts) {
  if (!sol || !opts || !opts.atUnit || !sol.reachable || sol.lob || sol.lofted || !shooterObj || dist < 30) return sol;
  const ammo = shooterObj.selectedAmmo || 'NORMAL';
  if (ammo === 'ANTI_TANK_MISSILE' || ammo === 'RPG') return sol;
  const ty = (terrain && terrain.getElevationAt ? terrain.getElevationAt(targetX, targetZ) : 0) + BallisticsSystem3D.AIM_CENTER_H;
  const h = el => this.shotHeightAt(shooterY, el, sol.charge || 1, shooterObj, probe, dist, sol.azimuth);
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
  // súng phóng lựu 40mm HV trên chân đế xe trinh sát: ngóc tới 45° bắn cầu vồng tầm trung
  if (shooter && shooter.mainGun && shooter.mainGun.kind === 'agl') return 45;
  return shooter && shooter.tankType === 'ARTILLERY' ? 70 : 20;
};
// Sơ tốc lựu 40mm HV (xe trinh sát) so với đạn 30mm của xe 6 nòng: Mk19 / Mk47 ~241 m/s (= 0,223 x 1080), cản x1,5 đạn
// 30mm (~4,5e-4 / m: quả lựu tù, nặng 0,34 kg) -> xa nhất ~2,2 km, tới 1,5 km mất ~9 s (trước đây 0,42: 454 m/s, bay 6,6 km)
BallisticsSystem3D.MAIN_AGL_V = 0.223;
BallisticsSystem3D.MAIN_AGL_K = 1.5;
// Quãng bay tối đa (tự hủy) của quả lựu 40mm HV / rocket giàn trên xe trinh sát (đơn vị game)
BallisticsSystem3D.MAIN_AGL_TRAVEL = 1500;
BallisticsSystem3D.MAIN_ROCKET_TRAVEL = 900;

window.BallisticsSystem3D = BallisticsSystem3D;
