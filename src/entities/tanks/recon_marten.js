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
  const CAB_CH = 0.6;          // mép nóc cabin vát chéo 45° quanh 4 phía (~7 cm) như thân xe bọc thép hàn tấm
  const CAB_FRONT = -9.4;      // chân kính chắn gió
  const RING_Z = 2.6;          // vị trí lỗ nóc gắn súng
  const TIRE_LUG = 0.5;        // chiều cao gai lốp
  const TIRE_BEAD = 2.3;       // bán kính mép vành

  function buildMarten(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team, { battle: 1 });
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
    buildSuspension(chassis, M);
    buildStowage(chassis, M, rnd);
    buildSpareWheel(chassis, M);
    unit.wheelSet = wheels;
    const sensor = buildRoofSensor(chassis, M, unit);
    const mg = buildRingMount(chassis, M, unit);
    // xạ thủ đứng ở lỗ nóc vòng súng (hình người, nạp đạn thủ công, có thể hy sinh) — vehicle_crew.js
    if (typeof VehicleCrew !== 'undefined') VehicleCrew.attachScoutGunner(unit, unit.turretGroup, mg);

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.rcwsTurret = null;

    let lastYaw = null;
    let scanTime = rnd() * 10;
    unit.modelAnimator = {
      update(dt, u) {
        if (dt <= 0) return;
        if (u.antennaSets) for (const a of u.antennaSets) a.update(dt);
        // kíp xe: xạ thủ (tư thế / nạp đạn thủ công / thương vong) + ống phóng tên lửa nạp kiểu TOW — vehicle_crew.js
        if (u.crew && typeof VehicleCrew !== 'undefined') VehicleCrew.animate(u, dt);
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

  // Cắt vát góc đa giác [x, z]: mỗi đỉnh thay bằng 2 đỉnh lùi k đơn vị theo hai cạnh kề (góc đứng thân xe vát chéo)
  function cutCorners(pts, k) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      out.push([p[0] + (a[0] - p[0]) * k / la, p[1] + (a[1] - p[1]) * k / la]);
      out.push([p[0] + (b[0] - p[0]) * k / lb, p[1] + (b[1] - p[1]) * k / lb]);
    }
    return out;
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
    ], HOOD_HALF * 2, 0.5), P);
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
      hb.cyl(0.5, 0.5, 0.2, 14, (s < 0 ? M.headLensL : M.headLensR) || M.lens, [x, y + 0.05, z - 0.75], 'z');
      hb.box(0.5, 0.35, 0.15, M.amberLens || M.tailLens, [x + s * 0.75, y - 0.4, z - 0.72]);
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
      hb.box(0.08, 1.7, 0.8, M.mirror || M.glass, [s * 8.22, 15.3, -16.9]);
      hb.setTag(null);
    }
    // Cản trước, móc kéo, biển số trắng
    hb.box(13.4, 1.4, 1.2, D, [0, 6.0, -18.8]);
    for (const s of [-1, 1]) {
      hb.add(new THREE.TorusGeometry(0.55, 0.16, 6, 12, Math.PI * 1.3), M.steel, [s * 4.6, 5.2, -19.3], [0, Math.PI / 2, Math.PI * 0.85]);
    }
    hb.box(4.2, 1.2, 0.12, M.plate, [0, 6.0, -19.45]);

    // Cản ủi ống thép trước mũi + tời kéo có cáp quấn, móc tời gác lên cản
    hb.setTag('bullbar');
    const bar = (a, b) => hb.strut(a, b, 0.22, D, 8);
    for (const s of [-1, 1]) {
      bar([s * 5.6, 5.4, -19.4], [s * 5.6, 9.4, -19.9]);
      bar([s * 5.6, 9.4, -19.9], [s * 2.2, 10.0, -19.7]);
      bar([s * 5.6, 5.4, -19.4], [s * 5.6, 5.6, -18.6]);
    }
    bar([-2.2, 10.0, -19.7], [2.2, 10.0, -19.7]);
    bar([-5.6, 7.6, -19.65], [5.6, 7.6, -19.65]);
    hb.box(4.6, 1.3, 1.1, D, [0, 6.9, -19.25]);
    hb.cyl(0.55, 0.55, 2.6, 12, M.steel, [0, 6.9, -19.4], 'x');
    for (let i = -3; i <= 3; i++) hb.cyl(0.6, 0.6, 0.08, 10, D, [i * 0.36, 6.9, -19.4], 'x');
    hb.add(new THREE.TorusGeometry(0.32, 0.1, 5, 10), M.steel, [0.6, 8.0, -19.95]);
    hb.strut([0.4, 7.2, -19.9], [0.6, 7.7, -19.95], 0.06, M.steel, 5);

    for (const s of [-1, 1]) {
      // Tấm thoát lầy (sand channel) kẹp dọc sườn dưới giữa hai bánh, 2 đai giữ
      hb.setTag('sand' + (s < 0 ? 'L' : 'R'));
      const sx = s * (HALF_W + 0.2);
      hb.box(0.22, 1.5, 7.6, M.paintDusty, [sx, 7.4, -0.4]);
      for (let i = 0; i < 7; i++) hb.box(0.26, 0.9, 0.3, D, [sx + s * 0.02, 7.4, -3.6 + i * 1.07]);
      for (const z of [-2.6, 1.8]) hb.box(0.4, 1.8, 0.32, M.steel, [sx + s * 0.08, 7.4, z]);
      // Tấm chắn bùn cao su sau bánh sau
      hb.setTag('flap' + (s < 0 ? 'L' : 'R'));
      hb.box(TIRE_W + 0.2, 2.6, 0.12, M.rubber, [s * WHEEL_X, 3.6, AXLES[1].z + WHEEL_R + 1.4], [0.08, 0, 0]);
    }
    hb.setTag(null);

    // Cabin hộp: mặt kính dốc nhẹ, sườn hơi vát vào trong, 4 góc đứng cắt vát
    hb.add(VehicleKit.loft(
      cutCorners([[-HALF_W, CAB_FRONT], [HALF_W, CAB_FRONT], [HALF_W, 17.6], [-HALF_W, 17.6]], 0.7),
      cutCorners([[-7.4, -6.9], [7.4, -6.9], [7.4, 17.0], [-7.4, 17.0]], 0.7),
      9.7, ROOF_Y, CAB_CH
    ), P);

    // Kính chắn gió 2 tấm phẳng + khung giữa + gạt mưa (nằm đúng trên mặt dốc của cabin)
    const CAB_TOP = -6.9, CAB_BASE_Y = 9.7;
    const slope = (CAB_TOP - CAB_FRONT) / (ROOF_Y - CAB_BASE_Y);
    const wsA = Math.atan(slope);
    const nY = Math.sin(wsA), nZ = -Math.cos(wsA);           // pháp tuyến hướng ra trước-lên
    const onFace = (y, out) => [y + nY * out, CAB_FRONT + (y - CAB_BASE_Y) * slope + nZ * out];
    for (const s of [-1, 1]) {
      const [gy, gz] = onFace(13.15, 0.08);
      hb.box(6.1, 3.1, 0.1, (s < 0 ? M.glassWindL : M.glassWindR) || M.glass, [s * 3.55, gy, gz], [wsA, 0, 0]);
      const [ty, tz] = onFace(14.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, ty, tz], [wsA, 0, 0]);
      const [by, bz] = onFace(11.65, 0.14);
      hb.box(6.7, 0.32, 0.22, P, [s * 3.55, by, bz], [wsA, 0, 0]);
      // Gạt mưa nằm trên kính, chốt ở mép trên
      const [wy, wz] = onFace(13.4, 0.2);
      hb.box(0.14, 2.9, 0.12, D, [s * 3.1, wy, wz], [wsA, 0, s * 0.55]);
    }
    const [py, pz] = onFace(13.2, 0.14);
    hb.box(0.7, 3.4, 0.24, P, [0, py, pz], [wsA, 0, 0]);

    // 4 cửa: viền cửa, ô kính nhỏ, bản lề tròn lộ, tay nắm, bậc lên
    for (const s of [-1, 1]) {
      const x = s * (HALF_W - 0.05);
      const sideA = Math.atan2(0.6, ROOF_Y - 9.7);
      for (const [z0, z1] of [[-6.6, 0.4], [0.8, 7.8]]) {
        const zc = (z0 + z1) / 2;
        hb.box(0.1, 4.9, 0.14, D, [x, 12.2, z0], [0, 0, s * sideA]);
        hb.box(0.1, 4.9, 0.14, D, [x, 12.2, z1], [0, 0, s * sideA]);
        hb.box(0.1, 0.14, z1 - z0, D, [s * (HALF_W - (14.55 - 9.7) * (0.6 / 5.7) + 0.05), 14.55, zc]);
        hb.box(0.1, 0.14, z1 - z0, D, [x + s * 0.05, 9.85, zc]);
        // Ô kính nhỏ + khung
        hb.box(0.12, 1.9, 2.4, M.glassDusty || M.glass, [x + s * 0.04 - s * 0.12, 13.6, zc - 0.6], [0, 0, s * sideA]);
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
      rail([s * 6.4, ROOF_Y, 6.6], [s * 6.4, RY, 7.2]);
      rail([s * 6.4, ROOF_Y, 15.9], [s * 6.4, RY, 15.6]);
      rail([s * 6.4, RY, 7.2], [s * 6.4, RY, 15.6]);
      rail([s * 6.4, ROOF_Y, 11.4], [s * 6.4, RY, 11.4]);
    }
    hb.setTag('railRear');
    rail([-6.4, RY, 15.6], [6.4, RY, 15.6]);
    hb.setTag(null);
    // Nóc: đường ghép, ống phóng lựu đạn khói, bệ ăng-ten
    hb.box(13.4, 0.06, 0.12, D, [0, ROOF_Y + 0.03, -2.0]);
    for (const s of [-1, 1]) {
      hb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      for (let i = 0; i < 3; i++) hb.cyl(0.32, 0.32, 1.3, 10, D, [s * 6.5, ROOF_Y + 0.45, -5.6 + i * 0.8], 'y', [0.45, 0, -s * 0.7]);
      hb.setTag(null);
    }
    const antennas = [[-6.2, -5.4], [-6.2, 15.9], [6.2, 15.9]];
    const ant = new VehicleKit.AntennaSet(D, chassis);
    for (const [ax, az] of antennas) {
      hb.cyl(0.38, 0.45, 0.8, 8, D, [ax, ROOF_Y + 0.4, az]);
      ant.add([ax, ROOF_Y + 0.8, az], 17, { tilt: [0.08, 0], r0: 0.085, r1: 0.04 });
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // --- Chi tiết bề mặt: bu-lông viền nóc, mối hàn mép nóc, đường ghép tấm, móc cẩu, nắp thông gió ---
    for (const s of [-1, 1]) {
      hb.boltRow([s * (7.4 - CAB_CH - 0.4), ROOF_Y, -3.2], [s * (7.4 - CAB_CH - 0.4), ROOF_Y, 15.9], 12, 'y', D, 0.13);
      // mối hàn theo đường gãy nóc phẳng - dải vát mép
      hb.weld([s * (7.4 - CAB_CH), ROOF_Y + 0.02, -6.9 + CAB_CH], [s * (7.4 - CAB_CH), ROOF_Y + 0.02, 17.0 - CAB_CH], P, 0.1);
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
    hb.seam([-6.7, ROOF_Y + 0.02, 9.2], [6.7, ROOF_Y + 0.02, 9.2], [0, 1, 0], D);
    hb.seam([0, ROOF_Y + 0.02, -6.2], [0, ROOF_Y + 0.02, -2.1], [0, 1, 0], D);
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

  // Lathe quanh trục đứng, UV chiếu từ trên xuống (đơn vị thế giới) -> vân sơn / bùn liền mạch trên mặt vành
  function latheTopUV(points, seg) {
    const smoothPts = new THREE.SplineCurve(points).getPoints(points.length * 3);
    const geo = new THREE.LatheGeometry(smoothPts, seg).toNonIndexed();
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * VehicleKit.UV_SCALE, pos.getZ(i) * VehicleKit.UV_SCALE + pos.getY(i) * 0.02);
    geo.userData.customUV = true;
    return geo;
  }

  // Mặt vành thép lòng chảo (trục Y, mặt ngoài hướng +Y): mép vành cuộn, thành chảo lõm, mặt bắt bu-lông, moay-ơ
  function rimFaceGeo(bead, H) {
    return latheTopUV([
      [bead + 0.26, H * 0.74], [bead + 0.24, H * 0.9], [bead + 0.02, H * 0.95], [bead - 0.12, H * 0.8],
      [bead - 0.3, H * 0.45], [bead - 0.5, H * 0.32], [1.3, H * 0.32], [1.2, H * 0.4], [1.08, H * 0.56], [0.8, H * 0.6]
    ].map(([r, y]) => new THREE.Vector2(r, y)), 30);
  }

  // Lốp từ VehicleKit.tireGeometry; không có vật liệu lốp riêng thì trụ cao su đơn giản
  function tireGeos(opts, M) {
    if (M.tire && M.tire !== M.rubber) return VehicleKit.tireGeometry(opts);
    return [new THREE.CylinderGeometry(opts.R + opts.lugH, opts.R + opts.lugH, opts.H * 2, 24)];
  }

  // ===========================================================================
  // HỆ TREO ĐỘC LẬP TAY ĐÒN KÉP: tay đòn trên/dưới, giảm chấn lò xo trụ, bán trục, vi sai, các-đăng
  // ===========================================================================
  function buildSuspension(chassis, M) {
    const b = new VehicleKit.PartBatch(0);
    const D = M.dark;
    for (const a of AXLES) {
      for (const s of [-1, 1]) {
        const hubX = s * (WHEEL_X - TIRE_W / 2 - 0.35), z = a.z;
        // Tay đòn chữ A dưới + tay đòn trên ngắn hơn, mỗi tay 2 nhánh về khung
        for (const dz of [-1.1, 1.1]) {
          b.strut([s * 3.4, 2.6, z + dz], [hubX, 2.9, z], 0.2, D, 6);
          b.strut([s * 3.9, 5.6, z + dz * 0.8], [hubX, 5.2, z], 0.16, D, 6);
        }
        b.box(0.7, 3.2, 1.0, M.steel, [hubX, 4.0, z]);
        // Bán trục + chụp cao su chống bụi
        b.cyl(0.24, 0.24, Math.abs(hubX) - 1.6, 8, M.steel, [(hubX + s * 1.6) / 2, WHEEL_Y, z], 'x');
        b.cyl(0.42, 0.3, 0.7, 10, M.rubber, [hubX - s * 0.5, WHEEL_Y, z], 'x');
        // Giảm chấn lò xo trụ nghiêng lên tai bắt trên khung
        const p0 = [s * 4.8, 3.1, z + 0.4], p1 = [s * 3.8, 8.6, z + 0.6];
        b.strut(p0, p1, 0.22, M.steel, 8);
        for (let i = 1; i < 9; i++) {
          const t = 0.12 + i * 0.085;
          b.add(new THREE.TorusGeometry(0.42, 0.08, 4, 10), M.paintDusty,
            [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t],
            [Math.PI / 2, 0, s * 0.18]);
        }
        b.box(1.2, 0.6, 1.2, D, [s * 3.8, 8.9, z + 0.6]);
      }
      // Bộ vi sai giữa cầu + thanh cân bằng ngang
      b.box(3.0, 2.2, 2.6, D, [0, WHEEL_Y, a.z]);
      b.cyl(0.18, 0.18, 7.2, 8, D, [0, 2.2, a.z + (a.steer ? 2.0 : -2.0)], 'x');
    }
    b.cyl(0.32, 0.32, AXLES[1].z - AXLES[0].z - 2.6, 10, M.steel, [0, WHEEL_Y, (AXLES[0].z + AXLES[1].z) / 2], 'z');
    b.build(chassis);
  }

  // ===========================================================================
  // ĐỒ CHẰNG TRÊN NÓC SAU (trong lan can): hòm đạn, cuộn bạt, bó lưới ngụy trang, xẻng
  // ===========================================================================
  function buildStowage(chassis, M, rnd) {
    const b = new VehicleKit.PartBatch(ROOF_Y);
    const Y = ROOF_Y, D = M.dark;
    b.setTag('stowage');
    for (const z of [8.4, 10.9]) {
      const h = 1.5;
      b.box(2.4, h, 2.2, M.paint, [4.0, Y + h / 2, z], [0, (rnd() - 0.5) * 0.1, 0]);
      b.box(2.5, 0.2, 2.3, M.paint, [4.0, Y + h + 0.1, z]);
      b.box(0.9, 0.12, 0.2, M.steel, [4.0, Y + h + 0.28, z]);
      b.box(0.04, 0.5, 0.7, M.canvas, [5.22, Y + h * 0.5, z]);
    }
    // Cuộn bạt ngang sát lan can sau, phồng xẹp không đều, 3 dây chằng
    const tz = 14.9, ty = Y + 0.9;
    for (let i = 0; i < 5; i++) {
      const r = 0.82 + rnd() * 0.12;
      b.cyl(r, r * 0.95, 2.24, 12, M.canvasDark, [-5.6 + i * 2.24 + 1.12, ty, tz + (rnd() - 0.5) * 0.12], 'x');
    }
    for (const x of [-3.4, 0, 3.4]) b.add(new THREE.TorusGeometry(0.9, 0.07, 4, 14), D, [x, ty, tz], [0, Math.PI / 2, 0]);
    for (const x of [-5.62, 5.62]) b.cyl(0.6, 0.6, 0.1, 12, M.canvas, [x, ty, tz], 'x');
    // Bó lưới ngụy trang bẹp phía trái + 2 dây chằng
    b.box(3.2, 1.0, 4.4, M.canvas, [-4.4, Y + 0.5, 9.4], [0, 0.06, 0.03]);
    b.box(3.0, 0.5, 3.6, M.canvasDark, [-4.3, Y + 1.15, 9.5], [0.05, -0.08, 0]);
    for (const z of [8.2, 10.6]) b.beam([-6.0, Y + 1.2, z], [-2.8, Y + 1.45, z], 0.4, 0.06, D);
    // Xẻng kẹp dọc lan can trái
    b.strut([-6.85, Y + 1.0, 7.0], [-6.85, Y + 1.0, 12.4], 0.14, M.wood || M.dark, 6);
    b.box(0.1, 1.3, 1.6, M.paintDusty, [-6.85, Y + 1.0, 13.3]);
    b.build(chassis);
  }

  // Bánh dự phòng trên giá bắt vào cửa sau (đứng, hông ngoài quay ra sau)
  function buildSpareWheel(chassis, M) {
    const g = new THREE.Group();
    const H = TIRE_W / 2;
    g.position.set(0, 12.6, 17.95 + H + 0.35);
    g.rotation.set(Math.PI / 2, 0, 0);
    chassis.add(g);
    const b = new VehicleKit.PartBatch(0);
    b.setTag('spare');
    for (const geo of tireGeos({ R: WHEEL_R - TIRE_LUG, H, bead: TIRE_BEAD, lugH: TIRE_LUG, seed: 29 }, M)) b.add(geo, M.tire || M.rubber, [0, 0, 0], [0, 0.4, 0]);
    b.cyl(TIRE_BEAD + 0.02, TIRE_BEAD + 0.02, H * 1.6, 28, M.rim, [0, 0, 0], 'y', null, true);
    b.add(rimFaceGeo(TIRE_BEAD, H), M.rim, [0, 0, 0]);
    b.cyl(0.75, 0.85, 0.5, 12, M.steel, [0, H * 0.6 + 0.2, 0]);
    b.box(3.0, 0.22, 0.7, M.dark, [0, H * 0.6 + 0.5, 0]);
    b.cyl(0.3, 0.3, 0.3, 6, M.steel, [0, H * 0.6 + 0.75, 0]);
    for (const x of [-1.6, 1.6]) b.box(0.4, H * 2 + 0.6, 0.4, M.dark, [x, -0.3, 0]);
    b.build(g);
  }

  // ===========================================================================
  // 4 BÁNH LỐP LỚN, VÀNH THÉP ĐEN
  // ===========================================================================
  function buildWheels(chassis, M) {
    const positions = [];
    for (const a of AXLES) for (const s of [-1, 1]) positions.push({ x: s * WHEEL_X, y: WHEEL_Y, z: a.z, steer: a.steer });
    return new VehicleKit.WheelSet(chassis, (b) => {
      const hw = TIRE_W / 2;
      // Lốp địa hình mặt cắt thật, gai đúc liền (trục Y xoay thành X)
      for (const geo of tireGeos({ R: WHEEL_R - TIRE_LUG, H: hw, bead: TIRE_BEAD, lugH: TIRE_LUG, seed: 17 }, M)) {
        geo.rotateZ(-Math.PI / 2);
        b.add(geo, M.tire || M.rubber, [0, 0, 0]);
      }
      // Vành thép lòng chảo, moay-ơ giảm tốc, đai ốc, van bơm hơi trung tâm + ống dẫn hơi ra mép vành
      b.cyl(TIRE_BEAD + 0.02, TIRE_BEAD + 0.02, TIRE_W * 0.82, 24, M.rim, [0, 0, 0], 'x', null, true);
      const face = rimFaceGeo(TIRE_BEAD, hw);
      face.rotateZ(-Math.PI / 2);
      b.add(face, M.rim, [0, 0, 0]);
      b.cyl(0.95, 1.05, 1.4, 14, M.rim, [hw - 0.1, 0, 0], 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cyl(0.15, 0.15, 0.3, 6, M.steel, [hw * 0.32 + 0.15, Math.cos(a) * 1.5, Math.sin(a) * 1.5], 'x');
      }
      b.cyl(0.4, 0.4, 0.7, 10, M.rim, [hw + 0.65, 0, 0], 'x');
      b.beam([hw + 0.5, 0.25, 0], [hw * 0.9, 2.1, 0.4], 0.14, 0.14, M.dark);
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

    // Ống phóng tên lửa chống tăng gắn bên phải giá súng (cố định, dùng lại): phóng xong nắp trước bung (lòng ống đen), luồng
    // phụt ngược sau ống (ExplosionFX.missileLaunch); xạ thủ mở nắp sau nạp quả mới từ phía sau vào (modelAnimator)
    const atgm = new THREE.Group();
    atgm.position.set(1.7, 0.5, -0.4);
    const ab = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    ab.box(0.7, 0.7, 1.2, M.dark, [0, -0.75, -0.6]);
    ab.box(1.1, 0.16, 3.2, M.dark, [0, -0.62, -0.8]);           // máng đỡ ống
    ab.build(atgm);
    const can = new THREE.Group();
    const cnb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    cnb.cyl(0.6, 0.6, 5.6, 14, M.paint, [0, 0, -0.8], 'z');
    cnb.cyl(0.62, 0.62, 0.22, 14, M.dark, [0, 0, -3.65], 'z');
    cnb.cyl(0.64, 0.64, 0.3, 14, M.dark, [0, 0, 2.0], 'z');
    cnb.box(0.22, 0.3, 0.9, M.dark, [0, 0.66, -0.6]);           // quai xách
    cnb.build(can);
    // nắp trước (còn đạn) / lòng ống đen ám khói (đã phóng)
    const capCover = new THREE.Mesh(new THREE.CircleGeometry(0.56, 14), M.dark);
    capCover.position.set(0, 0, -3.77); capCover.rotation.y = Math.PI;
    const capOpen = new THREE.Mesh(new THREE.CircleGeometry(0.5, 14), new THREE.MeshBasicMaterial({ color: 0x070605 }));
    capOpen.position.set(0, 0, -3.78); capOpen.rotation.y = Math.PI; capOpen.visible = false;
    // nắp khóa sau (bản lề mép trên) + quả tên lửa mới (chỉ hiện khi đang được đẩy vào từ phía sau)
    const rearCap = new THREE.Group();
    rearCap.position.set(0, 0.64, 2.16);
    const rc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 14), M.dark);
    rc.rotation.x = Math.PI / 2; rc.position.set(0, -0.64, 0.07);
    rearCap.add(rc);
    const missile = new THREE.Group();
    const mb = new VehicleKit.PartBatch(ROOF_Y + 3.4);
    mb.cyl(0.42, 0.42, 4.6, 12, M.paint, [0, 0, -1.2], 'z');
    mb.cyl(0.44, 0.44, 0.5, 12, M.dark, [0, 0, 1.0], 'z');      // khối động cơ / đuôi
    mb.build(missile);
    missile.visible = false;
    can.add(capCover, capOpen, rearCap, missile);
    atgm.add(can);
    unit.atgmCan = { can, capCover, capOpen, rearCap, missile };
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
