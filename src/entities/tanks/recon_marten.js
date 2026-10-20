/**
 * XE BỌC GIÁP TRINH SÁT HẠNG NHẸ MARTEN R4  (tankType: SCOUT)
 *
 * Thiết kế hư cấu theo kiểu xe bọc giáp hạng nhẹ 4x4 cabin hộp:
 * - Động cơ đặt trước: nắp máy dốc, lưới tản nhiệt nan ngang ở mũi, vè trước loe ôm bánh
 * - Cabin hộp đứng bọc giáp, kính chắn gió 2 tấm phẳng có gạt mưa, 4 cửa có ô kính nhỏ & bản lề lộ
 * - Lỗ nóc gắn súng máy hạng nặng có tấm chắn đạn, nắp mở dựng phía sau, lan can ống quanh nóc sau
 * - 3 ăng-ten liên lạc cao, khung bảo vệ đèn, gương trên cần ở 2 góc trước, biển số trắng
 * - Bánh lốp lớn vành thép đen; trên nóc sau có cảm biến giám sát xoay (radar trinh sát)
 *
 * Hook gameplay: radarDish (spg.js xoay), barrelPivot/barrelGroup/muzzleTipLocal (súng máy & tên lửa),
 * antiTankLauncherMesh, gatlingShotFlash (chớp lửa nòng). Tỉ lệ ~8 đơn vị = 1 mét, mũi xe hướng -Z.
 */

(function () {
  if (typeof TankModelBuilder === 'undefined' || typeof VehicleKit === 'undefined') return;

  const WHEEL_R = 3.8;
  const TIRE_W = 2.9;
  const WHEEL_X = 7.0;
  const WHEEL_Y = WHEEL_R;
  const AXLES = [{ z: -11.6, steer: 1 }, { z: 11.0, steer: 0 }];
  const HALF_W = 8.0;          // nửa bề ngang thân
  const HOOD_HALF = 6.6;       // nửa bề ngang nắp máy
  const ROOF_Y = 15.4;
  const CAB_FRONT = -9.4;      // chân kính chắn gió
  const RING_Z = 2.6;          // vị trí lỗ nóc gắn súng

  function buildMarten(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team);
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    M.rim = new THREE.MeshStandardMaterial({ color: 0x1f2120, roughness: 0.7, metalness: 0.35 });
    M.plate = new THREE.MeshStandardMaterial({ color: 0xe9ecea, roughness: 0.6, metalness: 0.1 });
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildBody(chassis, M, unit, rnd);
    const wheels = buildWheels(chassis, M);
    unit.wheelSet = wheels;
    const sensor = buildRoofSensor(chassis, M, unit);
    const mg = buildRingMount(chassis, M, unit);

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.rcwsTurret = null;

    let lastYaw = null;
    let scanTime = rnd() * 10;
    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        const yaw = u.group.rotation.y;
        let dYaw = lastYaw === null ? 0 : yaw - lastYaw;
        lastYaw = yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const v = u.isDead ? 0 : (u.speed || 0);
        const dl = v * dt - dYaw * WHEEL_X;
        const dr = v * dt + dYaw * WHEEL_X;
        wheels.steerAngle = Math.max(-0.55, Math.min(0.55, (u.currentSteer || 0) * 1.3));
        wheels.roll(dl, dr);
        if (!u.isDead) {
          scanTime += dt;
          sensor.head.rotation.y = Math.sin(scanTime * 0.4) * 1.2;
        }
        // Nạp đạn súng máy: nòng ngóc lên, lật nắp khóa nòng, tháo hộp đạn rỗng, lắp hộp mới, đóng nắp
        const reloading = !u.isDead && u.gatlingMag <= 0 && u.reloadTimer > 0 && u.reloadDuration > 0;
        const pr = reloading ? 1 - u.reloadTimer / u.reloadDuration : 1;
        const seg = (a, b) => Math.max(0, Math.min(1, (pr - a) / (b - a)));
        const sm = x => x * x * (3 - 2 * x);
        const tilt = reloading ? sm(seg(0, 0.12)) * (1 - sm(seg(0.88, 1))) : 0;
        mg.barrel.rotation.x = 0.2 * tilt;
        mg.cover.rotation.x = reloading ? -1.2 * sm(seg(0.08, 0.2)) * (1 - sm(seg(0.8, 0.9))) : 0;
        let off = 0, rz = 0, vis = true;
        if (reloading) {
          if (pr < 0.44) { off = sm(seg(0.2, 0.42)); rz = off * 0.7; vis = pr < 0.42; }
          else { off = 1 - sm(seg(0.46, 0.76)); rz = -off * 0.4; }
        }
        mg.ammo.position.set(mg.ammo0.x - 0.9 * off, mg.ammo0.y - 2.0 * off, mg.ammo0.z + 0.3 * off);
        mg.ammo.rotation.z = rz;
        mg.ammo.visible = vis;
        // Chớp lửa đầu nòng súng máy (spg.js đặt gatlingShotFlash = 1 mỗi phát)
        let f = u.gatlingShotFlash || 0;
        if (u.isDead) f = 0;
        if (f > 0.02) {
          if (f >= 0.999) {
            const k = 0.7 + Math.random() * 0.6;
            mg.flash.scale.set(k, k, 0.8 + Math.random() * 0.5);
            mg.flash.rotation.z = Math.random() * Math.PI;
          }
          mg.flash.visible = true;
          mg.flashMat.opacity = Math.min(1, f) * (u.stealthAlpha !== undefined ? u.stealthAlpha : 1);
          mg.flashMat.depthWrite = false;
          u.gatlingShotFlash = f * Math.exp(-dt * 30);
        } else {
          mg.flash.visible = false;
          u.gatlingShotFlash = 0;
        }
      }
    };
    return { hullW: HALF_W * 2 };
  }

  function archPoints(cz, r, yCut) {
    const a0 = Math.asin(Math.max(-1, Math.min(1, (yCut - WHEEL_Y) / r)));
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const a = a0 + (Math.PI - 2 * a0) * (i / 9);
      pts.push([cz + r * Math.cos(a), WHEEL_Y + r * Math.sin(a)]);
    }
    return pts;
  }

  // ===========================================================================
  // THÂN XE: KHOANG MÁY TRƯỚC + CABIN HỘP BỌC GIÁP
  // ===========================================================================
  function buildBody(chassis, M, unit, rnd) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;
    const AR = 4.7;

    // Thân dưới (sườn + đuôi), khoét 2 hốc bánh
    hb.add(VehicleKit.sideProfile([
      [-14.6, 9.8], [17.6, 9.8], [18.2, 9.0], [18.0, 5.0],
      ...archPoints(AXLES[1].z, AR, 5.0),
      ...archPoints(AXLES[0].z, AR, 5.2),
      [-16.0, 5.2], [-16.0, 9.0]
    ], HALF_W * 2, 0.22), P);
    for (const a of AXLES) hb.box(10.6, 5.0, 9.2, D, [0, 7.6, a.z]);
    // Gầm thép + giá đỡ
    hb.box(11.2, 0.8, 30, M.paintDusty, [0, 4.6, 1.0]);

    // Khoang máy phía trước: nắp máy dốc lên về phía kính
    hb.add(VehicleKit.sideProfile([
      [-18.4, 5.6], [-18.6, 8.6], [-17.6, 10.6], [CAB_FRONT + 0.4, 11.6], [CAB_FRONT + 0.4, 8.6], [-16.0, 5.6]
    ], HOOD_HALF * 2, 0.25), P);
    // Lưới tản nhiệt nan ngang ở mặt trước (dốc)
    const grillA = Math.atan2(1.0, 2.0);
    for (let i = 0; i < 7; i++) {
      const y = 8.75 + i * 0.27;
      hb.box(HOOD_HALF * 2 - 2.6, 0.12, 0.4, D, [0, y, -18.62 + i * 0.135], [grillA, 0, 0]);
    }
    for (let i = 0; i < 9; i++) hb.box(HOOD_HALF * 2 - 2.4, 0.16, 0.28, M.paintDusty, [0, 5.9 + i * 0.32, -18.66]);
    // Nắp thăm máy + đường ghép trên nắp
    hb.box(9.6, 0.06, 0.14, D, [0, 11.02, -14.0], [-0.12, 0, 0]);
    hb.box(0.14, 0.06, 7.2, D, [0, 11.15, -13.6], [-0.12, 0, 0]);

    // Vè trước loe ôm bánh (tấm sườn + viền cao su)
    for (const s of [-1, 1]) {
      const fender = [];
      const fz = AXLES[0].z;
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * 0.08 + Math.PI * 0.84 * (i / 10);
        fender.push([fz + (AR + 0.5) * Math.cos(a), WHEEL_Y + (AR + 0.5) * Math.sin(a)]);
      }
      for (let i = 10; i >= 0; i--) {
        const a = Math.PI * 0.08 + Math.PI * 0.84 * (i / 10);
        fender.push([fz + (AR - 0.1) * Math.cos(a), WHEEL_Y + (AR - 0.1) * Math.sin(a)]);
      }
      hb.add(VehicleKit.sideProfile(fender, 2.2, 0.08), P, [s * (HALF_W - 0.4), 0, 0]);
      hb.box(2.4, 0.5, 4.2, P, [s * (HALF_W - 0.6), 10.0, fz - 2.6]);
      // Khối vè ngang nối nắp máy
      hb.box(HALF_W - HOOD_HALF + 0.6, 1.2, 8.6, P, [s * ((HALF_W + HOOD_HALF) / 2), 9.6, fz]);
      // Vè sau bằng cao su
      hb.add(new THREE.TorusGeometry(AR + 0.15, 0.3, 6, 14, Math.PI * 0.84), M.rubber,
        [s * (HALF_W + 0.04), WHEEL_Y, AXLES[1].z], [0, Math.PI / 2, Math.PI * 0.08]);
    }

    // Đèn pha trên đầu vè có khung bảo vệ + đèn xi-nhan
    for (const s of [-1, 1]) {
      const x = s * 6.6, z = -17.2, y = 10.9;
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(2.2, 1.6, 1.4, D, [x, y, z]);
      hb.cyl(0.5, 0.5, 0.2, 14, M.lens, [x, y + 0.05, z - 0.75], 'z');
      hb.box(0.5, 0.35, 0.15, M.tailLens, [x + s * 0.75, y - 0.4, z - 0.72]);
      // Khung lồng đèn
      hb.box(2.8, 0.16, 0.16, D, [x, y + 1.0, z - 1.2]);
      hb.box(2.8, 0.16, 0.16, D, [x, y - 0.9, z - 1.2]);
      for (const dx of [-1.3, 0, 1.3]) hb.box(0.14, 2.0, 0.14, D, [x + dx, y + 0.05, z - 1.25]);
      hb.box(0.16, 0.16, 1.4, D, [x - 1.3, y + 1.0, z - 0.5]);
      hb.box(0.16, 0.16, 1.4, D, [x + 1.3, y + 1.0, z - 0.5]);
      // Gương chiếu hậu trên cần cao ở góc trước
      hb.setTag('mirror' + (s < 0 ? 'L' : 'R'));
      hb.box(0.25, 3.6, 0.25, D, [s * 8.0, 12.8, -15.6]);
      hb.box(0.25, 0.25, 1.4, D, [s * 8.0, 14.6, -16.2]);
      hb.box(0.4, 2.0, 1.0, D, [s * 8.0, 15.3, -16.9]);
      hb.box(0.08, 1.7, 0.8, M.glass, [s * 8.22, 15.3, -16.9]);
      hb.setTag(null);
    }
    // Cản trước, móc kéo, biển số trắng
    hb.box(13.4, 1.4, 1.2, D, [0, 6.0, -18.8]);
    for (const s of [-1, 1]) {
      hb.add(new THREE.TorusGeometry(0.55, 0.16, 6, 12, Math.PI * 1.3), M.steel, [s * 4.6, 5.2, -19.3], [0, Math.PI / 2, Math.PI * 0.85]);
    }
    hb.box(4.2, 1.2, 0.12, M.plate, [0, 6.0, -19.45]);

    // Cabin hộp: mặt kính dốc nhẹ, sườn hơi vát vào trong
    hb.add(VehicleKit.loft(
      [[-HALF_W, CAB_FRONT], [HALF_W, CAB_FRONT], [HALF_W, 17.6], [-HALF_W, 17.6]],
      [[-7.4, -6.9], [7.4, -6.9], [7.4, 17.0], [-7.4, 17.0]],
      9.7, ROOF_Y
    ), P);

    // Kính chắn gió 2 tấm phẳng + khung giữa + gạt mưa (nằm đúng trên mặt dốc của cabin)
    const CAB_TOP = -6.9, CAB_BASE_Y = 9.7;
    const slope = (CAB_TOP - CAB_FRONT) / (ROOF_Y - CAB_BASE_Y);
    const wsA = Math.atan(slope);
    const nY = Math.sin(wsA), nZ = -Math.cos(wsA);           // pháp tuyến hướng ra trước-lên
    const onFace = (y, out) => [y + nY * out, CAB_FRONT + (y - CAB_BASE_Y) * slope + nZ * out];
    for (const s of [-1, 1]) {
      const [gy, gz] = onFace(13.45, 0.08);
      hb.box(6.1, 3.5, 0.1, M.glass, [s * 3.55, gy, gz], [wsA, 0, 0]);
      const [ty, tz] = onFace(15.25, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, ty, tz], [wsA, 0, 0]);
      const [by, bz] = onFace(11.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, by, bz], [wsA, 0, 0]);
      // Gạt mưa nằm trên kính, chốt ở mép trên
      const [wy, wz] = onFace(14.6, 0.2);
      hb.box(0.14, 2.9, 0.12, D, [s * 3.1, wy, wz], [wsA, 0, s * 0.55]);
    }
    const [py, pz] = onFace(13.45, 0.14);
    hb.box(0.7, 3.9, 0.24, P, [0, py, pz], [wsA, 0, 0]);

    // 4 cửa: viền cửa, ô kính nhỏ, bản lề tròn lộ, tay nắm, bậc lên
    for (const s of [-1, 1]) {
      const x = s * (HALF_W - 0.05);
      const sideA = Math.atan2(0.6, ROOF_Y - 9.7);
      for (const [z0, z1] of [[-6.6, 0.4], [0.8, 7.8]]) {
        const zc = (z0 + z1) / 2;
        hb.box(0.1, 5.3, 0.14, D, [x, 12.4, z0], [0, 0, s * sideA]);
        hb.box(0.1, 5.3, 0.14, D, [x, 12.4, z1], [0, 0, s * sideA]);
        hb.box(0.1, 0.14, z1 - z0, D, [x - s * 0.08, 15.0, zc]);
        hb.box(0.1, 0.14, z1 - z0, D, [x + s * 0.05, 9.85, zc]);
        // Ô kính nhỏ + khung
        hb.box(0.12, 1.9, 2.4, M.glass, [x + s * 0.04 - s * 0.12, 13.6, zc - 0.6], [0, 0, s * sideA]);
        hb.box(0.14, 2.3, 0.18, P, [x + s * 0.06 - s * 0.12, 13.6, zc - 2.0], [0, 0, s * sideA]);
        hb.box(0.14, 2.3, 0.18, P, [x + s * 0.06 - s * 0.12, 13.6, zc + 0.8], [0, 0, s * sideA]);
        // Bản lề (2 cái) ở mép trước cửa + tay nắm ở mép sau
        for (const y of [11.0, 13.8]) hb.cyl(0.38, 0.38, 0.35, 10, P, [x + s * 0.2, y, z0 + 0.5], 'x');
        hb.box(0.3, 0.3, 1.2, M.steel, [x + s * 0.18, 12.2, z1 - 1.0]);
      }
      hb.box(2.2, 0.3, 4.4, D, [s * 7.6, 5.2, 0.6]);
      // Nắp bình nhiên liệu tròn + hộp phụ kiện sau cửa
      hb.cyl(0.6, 0.6, 0.3, 12, D, [x + s * 0.12, 12.0, 11.8], 'x');
      hb.setTag('box' + (s < 0 ? 'L' : 'R'));
      hb.box(0.6, 2.2, 3.2, P, [x + s * 0.3, 11.2, 14.8]);
      hb.setTag(null);
    }

    // Đuôi xe: cửa sau, đèn hậu, can nhiên liệu, móc kéo
    hb.box(7.0, 4.6, 0.25, P, [0, 12.2, 17.7]);
    hb.box(7.2, 0.1, 0.3, D, [0, 14.6, 17.72]);
    hb.box(0.3, 1.2, 0.3, M.steel, [2.6, 12.0, 17.9]);
    for (const s of [-1, 1]) {
      hb.box(1.4, 0.9, 0.35, D, [s * 6.6, 8.6, 18.1]);
      hb.box(0.55, 0.45, 0.1, M.tailLens, [s * 6.9, 8.65, 18.3]);
      hb.setTag('can' + (s < 0 ? 'L' : 'R'));
      hb.jerrycan([s * 5.4, 12.0, 18.33], Math.PI / 2, 0.95, 2.9, 2.1, P, D);
      hb.box(2.3, 0.2, 0.08, D, [s * 5.4, 11.3, 18.84]);
      hb.setTag(null);
    }
    hb.box(1.8, 1.0, 1.0, D, [0, 6.0, 18.4]);
    hb.cyl(0.36, 0.36, 1.8, 10, D, [-6.0, 5.4, 17.6], 'z');
    unit.exhaustLeft = new THREE.Object3D();
    unit.exhaustLeft.position.set(-6.0, 5.4, 18.7);
    unit.exhaustRight = new THREE.Object3D();
    unit.exhaustRight.position.set(-5.8, 5.6, 18.5);
    chassis.add(unit.exhaustLeft);
    chassis.add(unit.exhaustRight);

    // Lan can ống quanh nóc sau (như xe mẫu)
    const rail = (a, b) => hb.strut(a, b, 0.18, D, 6);
    const RY = ROOF_Y + 1.6;
    for (const s of [-1, 1]) {
      hb.setTag('rail' + (s < 0 ? 'L' : 'R'));
      rail([s * 6.8, ROOF_Y, 6.6], [s * 6.8, RY, 7.2]);
      rail([s * 6.8, ROOF_Y, 16.2], [s * 6.8, RY, 15.8]);
      rail([s * 6.8, RY, 7.2], [s * 6.8, RY, 15.8]);
      rail([s * 6.8, ROOF_Y, 11.4], [s * 6.8, RY, 11.4]);
    }
    hb.setTag('railRear');
    rail([-6.8, RY, 15.8], [6.8, RY, 15.8]);
    hb.setTag(null);
    // Nóc: đường ghép, ống phóng lựu đạn khói, bệ ăng-ten
    hb.box(14.4, 0.06, 0.12, D, [0, ROOF_Y + 0.03, -2.0]);
    for (const s of [-1, 1]) {
      hb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      for (let i = 0; i < 3; i++) hb.cyl(0.32, 0.32, 1.3, 10, D, [s * 6.5, ROOF_Y + 0.45, -5.6 + i * 0.8], 'y', [0.45, 0, -s * 0.7]);
      hb.setTag(null);
    }
    const antennas = [[-6.8, -5.8], [-6.6, 16.4], [6.6, 16.4]];
    const ant = new VehicleKit.AntennaSet(D, chassis);
    for (const [ax, az] of antennas) {
      hb.cyl(0.38, 0.45, 0.8, 8, D, [ax, ROOF_Y + 0.4, az]);
      ant.add([ax, ROOF_Y + 0.8, az], 17, { tilt: [0.08, 0], r0: 0.085, r1: 0.04 });
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // --- Chi tiết bề mặt: bu-lông viền nóc, mối hàn mép nóc, đường ghép tấm, móc cẩu, nắp thông gió ---
    for (const s of [-1, 1]) {
      hb.boltRow([s * 7.0, ROOF_Y, -3.2], [s * 7.0, ROOF_Y, 16.4], 12, 'y', D, 0.13);
      hb.weld([s * 7.38, ROOF_Y + 0.02, -6.7], [s * 7.38, ROOF_Y + 0.02, 16.8], P, 0.1);
      for (const z of [-1.0, 14.6]) {
        hb.box(0.8, 0.28, 0.5, P, [s * 5.6, ROOF_Y + 0.12, z]);
        hb.add(new THREE.TorusGeometry(0.4, 0.13, 5, 10), M.steel, [s * 5.6, ROOF_Y + 0.42, z], [0, Math.PI / 2, 0]);
      }
      // Sườn sau cửa: đường ghép dọc + bu-lông tấm giáp
      const fx = (y) => s * (HALF_W - (y - 9.7) * (0.6 / 5.7) + 0.03);
      hb.seam([fx(10.2), 10.2, 9.0], [fx(14.8), 14.8, 9.0], [s, 0, 0], D);
      const bx = s * (HALF_W - (14.6 - 9.7) * (0.6 / 5.7));
      hb.boltRow([bx, 14.6, 9.6], [bx, 14.6, 16.6], 6, 'x', D, 0.13, s, [0, 0, s * Math.atan2(0.6, 5.7)]);
    }
    hb.seam([-7.0, ROOF_Y + 0.02, 9.2], [7.0, ROOF_Y + 0.02, 9.2], [0, 1, 0], D);
    hb.seam([0, ROOF_Y + 0.02, -6.4], [0, ROOF_Y + 0.02, -2.1], [0, 1, 0], D);
    // Nắp thông gió hộp có lá chớp trên nóc sau
    hb.box(3.0, 0.5, 2.4, P, [-2.6, ROOF_Y + 0.25, 13.0]);
    for (let i = 0; i < 4; i++) hb.box(2.6, 0.08, 0.32, D, [-2.6, ROOF_Y + 0.52, 12.2 + i * 0.52], [0.5, 0, 0]);
    // Cửa sau: bản lề + bu-lông viền
    hb.hinge([-3.75, 12.2, 17.86], 'y', 3.8, P, 0.22);
    hb.boltRow([-3.0, 14.25, 17.83], [3.0, 14.25, 17.83], 6, 'z', D, 0.12, 1);
    // Nắp máy: hàng bu-lông mép nắp thăm
    hb.boltRow([-4.6, 11.0, -13.9], [4.6, 11.0, -13.9], 7, 'y', D, 0.12, 1, [-0.12, 0, 0]);

    const meshes = hb.build(chassis, [0, 10, 0]);
    unit.hullMainMesh = meshes.get(P);

    // Biển số + số hiệu chiến thuật
    const plate = VehicleKit.createStencilDecal(`0${1 + Math.floor(rnd() * 8)}-${1000 + Math.floor(rnd() * 8999)}`, 3.9, 1.0, 'rgba(25,60,35,0.95)');
    if (plate) { plate.position.set(0, 6.0, -19.53); plate.rotation.y = Math.PI; chassis.add(plate); }
    const tac = `${1 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const d = VehicleKit.createStencilDecal(tac, 2.6, 1.0);
      if (d) { d.position.set(s * (HALF_W + 0.04), 8.2, 14.6); d.rotation.y = s * Math.PI / 2; chassis.add(d); }
    }
  }

  // ===========================================================================
  // 4 BÁNH LỐP LỚN, VÀNH THÉP ĐEN
  // ===========================================================================
  function buildWheels(chassis, M) {
    const positions = [];
    for (const a of AXLES) for (const s of [-1, 1]) positions.push({ x: s * WHEEL_X, y: WHEEL_Y, z: a.z, steer: a.steer });
    return new VehicleKit.WheelSet(chassis, (b) => {
      const hw = TIRE_W / 2;
      b.cyl(WHEEL_R - 0.3, WHEEL_R - 0.3, TIRE_W, 26, M.rubber, [0, 0, 0], 'x');
      for (const sx of [-1, 1]) {
        b.add(new THREE.TorusGeometry(WHEEL_R - 0.72, 0.46, 8, 26), M.rubber, [sx * (hw - 0.46), 0, 0], [0, Math.PI / 2, 0]);
      }
      const lugs = 18;
      for (let i = 0; i < lugs; i++) {
        const a = (i / lugs) * Math.PI * 2;
        for (const sx of [-1, 1]) {
          b.box(1.15, 0.42, 0.95, M.rubber, [sx * 0.68, Math.cos(a) * (WHEEL_R - 0.18), Math.sin(a) * (WHEEL_R - 0.18)], [a, sx * 0.55, 0]);
        }
      }
      // Vành thép đen có lỗ thoát nhiệt + moay-ơ
      b.cyl(2.2, 2.2, TIRE_W + 0.04, 18, M.rim, [0, 0, 0], 'x');
      b.cyl(1.9, 1.9, 0.2, 18, M.rim, [hw + 0.03, 0, 0], 'x');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        b.cyl(0.36, 0.36, 0.1, 10, M.dark, [hw + 0.15, Math.cos(a) * 1.3, Math.sin(a) * 1.3], 'x');
      }
      b.cyl(0.8, 0.9, 0.55, 12, M.rim, [hw + 0.32, 0, 0], 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cyl(0.1, 0.1, 0.3, 6, M.steel, [hw + 0.4, Math.cos(a) * 0.62, Math.sin(a) * 0.62], 'x');
      }
    }, positions, WHEEL_R);
  }

  // ===========================================================================
  // CẢM BIẾN GIÁM SÁT XOAY TRÊN NÓC SAU (radar trinh sát)
  // ===========================================================================
  function buildRoofSensor(chassis, M, unit) {
    const base = new THREE.Group();
    base.position.set(-3.6, ROOF_Y, 12.6);
    chassis.add(base);
    const mb = new VehicleKit.PartBatch(ROOF_Y);
    mb.box(1.6, 0.8, 1.6, M.dark, [0, 0.4, 0]);
    mb.cyl(0.32, 0.32, 3.2, 10, M.steel, [0, 2.4, 0]);
    mb.build(base);
    const head = new THREE.Group();
    head.position.set(0, 4.2, 0);
    const hb = new VehicleKit.PartBatch(ROOF_Y + 4.2);
    hb.box(1.6, 1.1, 1.3, M.paint, [0, 0, 0]);
    hb.cyl(0.32, 0.32, 0.2, 12, M.glass, [-0.35, 0.05, -0.7], 'z');
    hb.cyl(0.22, 0.22, 0.2, 12, M.glass, [0.38, 0.05, -0.7], 'z');
    hb.build(head);
    base.add(head);
    const radar = new THREE.Group();
    radar.position.set(0, 5.1, 0);
    const rb = new VehicleKit.PartBatch(ROOF_Y + 5.1);
    // Ăng-ten radar mảng phẳng giám sát mặt đất: quay tròn liên tục (góc quay = tia quét thật của radar)
    rb.cyl(0.3, 0.4, 0.5, 10, M.dark, [0, 0, 0]);                       // bàn xoay
    rb.cyl(0.14, 0.14, 0.7, 8, M.steel, [0, 0.55, 0]);                  // trục
    rb.box(5.0, 1.55, 0.3, M.paint, [0, 1.45, 0], [-0.2, 0, 0]);         // mặt anten ngả nhẹ lên trời
    rb.box(4.7, 1.3, 0.06, M.dark, [0, 1.47, -0.17], [-0.2, 0, 0]);      // mặt phát sóng
    for (let i = -2; i <= 2; i++) rb.box(0.05, 1.32, 0.02, M.steel, [i * 0.9, 1.47, -0.21], [-0.2, 0, 0]);
    rb.box(1.3, 0.75, 0.55, M.paint, [0, 1.3, 0.48]);                   // hộp thu phát phía sau
    rb.build(radar);
    base.add(radar);
    unit.radarDish = radar;
    VehicleKit.registerPartGroup(unit, 'sensor', base);
    return { head, radar };
  }

  // ===========================================================================
  // LỖ NÓC GẮN SÚNG MÁY HẠNG NẶNG CÓ TẤM CHẮN + ỐNG PHÓNG TÊN LỬA CHỐNG TĂNG
  // ===========================================================================
  function buildRingMount(chassis, M, unit) {
    const turret = new THREE.Group();
    turret.position.set(0, ROOF_Y, RING_Z);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(ROOF_Y);
    tb.add(new THREE.TorusGeometry(2.3, 0.32, 8, 24), M.dark, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
    tb.cyl(2.1, 2.1, 0.1, 24, M.dark, [0, 0.12, 0]);
    // Nắp lỗ nóc mở dựng phía sau
    tb.cyl(2.0, 2.0, 0.3, 20, M.paint, [0, 2.1, 2.6], 'z', [0.25, 0, 0]);
    // Trụ súng
    tb.cyl(0.35, 0.45, 2.4, 10, M.dark, [0, 1.3, -1.2]);
    // Tấm chắn đạn: 2 cánh nghiêng hai bên khe súng + tấm trên
    tb.setTag('shield');
    for (const s of [-1, 1]) tb.box(1.9, 2.3, 0.22, M.paint, [s * 1.35, 2.8, -2.7], [0.18, s * 0.28, 0]);
    tb.box(4.8, 0.7, 0.22, M.paint, [0, 4.15, -2.72], [0.18, 0, 0]);
    tb.box(4.8, 0.5, 0.22, M.paint, [0, 1.85, -2.6], [0.18, 0, 0]);
    tb.setTag(null);
    tb.build(turret);

    const pivot = new THREE.Group();
    pivot.position.set(0, 2.9, -1.2);
    unit.barrelPivot = pivot;
    turret.add(pivot);
    const cb = new VehicleKit.PartBatch(ROOF_Y + 2.9);
    cb.box(0.4, 0.9, 0.6, M.dark, [0, -0.6, 0]);
    cb.box(0.3, 0.5, 0.9, M.dark, [-0.55, -0.35, 0.4]);  // khay đỡ hộp đạn
    cb.build(pivot);
    // Hộp đạn 100 viên rời (thay khi nạp đạn)
    const ammo = new THREE.Group();
    ammo.position.set(-1.2, -0.3, 0.4);
    const amb = new VehicleKit.PartBatch(ROOF_Y + 2.6);
    amb.box(1.4, 1.4, 1.6, M.paint, [0, 0, 0]);
    amb.box(1.45, 0.12, 1.65, M.dark, [0, 0.72, 0]);
    amb.box(0.5, 0.12, 0.2, M.dark, [0, 0.82, 0]);           // quai xách
    amb.build(ammo);
    pivot.add(ammo);

    // Ống phóng tên lửa chống tăng gắn bên phải giá súng
    const atgm = new THREE.Group();
    atgm.position.set(1.7, 0.5, -0.4);
    const ab = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    ab.cyl(0.6, 0.6, 5.6, 14, M.paint, [0, 0, -0.8], 'z');
    ab.cyl(0.62, 0.62, 0.22, 14, M.dark, [0, 0, -3.65], 'z');
    ab.cyl(0.64, 0.64, 0.3, 14, M.dark, [0, 0, 2.0], 'z');
    ab.box(0.7, 0.7, 1.2, M.dark, [0, -0.75, -0.6]);
    ab.build(atgm);
    pivot.add(atgm);
    unit.antiTankLauncherMesh = atgm;
    VehicleKit.registerPartGroup(unit, 'atgm', atgm);
    unit.atgmTipLocal = new THREE.Vector3(0, 0, -3.9);
    unit.atgmRearLocal = new THREE.Vector3(0, 0, 2.3);

    // Súng máy hạng nặng: thân súng, nòng có ống làm mát đục lỗ, loa che lửa
    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);
    const gb = new VehicleKit.PartBatch(ROOF_Y + 2.9);
    gb.box(0.8, 0.95, 3.2, M.dark, [0, 0, 0.6]);
    gb.box(0.25, 0.6, 0.9, M.dark, [0, 0.2, 2.6]);
    gb.cyl(0.27, 0.27, 2.0, 10, M.dark, [0, 0.05, -2.0], 'z');
    gb.cyl(0.17, 0.17, 6.6, 10, M.dark, [0, 0.05, -5.6], 'z');
    gb.cyl(0.26, 0.24, 1.0, 10, M.dark, [0, 0.05, -9.3], 'z');
    gb.cyl(0.12, 0.12, 0.06, 8, M.bore, [0, 0.05, -9.82], 'z');
    gb.box(0.18, 0.45, 0.18, M.dark, [0, 0.4, -8.4]);
    gb.build(barrel);
    unit.muzzleTipLocal = new THREE.Vector3(0, 0.05, -10.0);
    // Nắp hộp khóa nòng (lật lên khi lắp dây đạn mới), bản lề phía trước
    const cover = new THREE.Group();
    cover.position.set(0, 0.48, -0.2);
    const cvb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    cvb.box(0.84, 0.12, 1.7, M.dark, [0, 0.06, 0.85]);
    cvb.box(0.2, 0.18, 0.3, M.dark, [0, 0.18, 1.55]);
    cvb.build(cover);
    barrel.add(cover);

    const flashMat = new THREE.MeshBasicMaterial({
      map: VehicleKit.getMuzzleFlashTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flash = new THREE.Group();
    flash.position.set(0, 0.05, -10.9);
    flash.add(new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), flashMat));
    for (const rz of [0, Math.PI / 2]) {
      const petal = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 4.4), flashMat);
      petal.rotation.set(Math.PI / 2, 0, rz);
      petal.position.z = -1.7;
      flash.add(petal);
    }
    flash.visible = false;
    barrel.add(flash);
    return { flash, flashMat, ammo, ammo0: ammo.position.clone(), cover, barrel };
  }

  TankModelBuilder.registerModel('SCOUT', buildMarten);
})();
