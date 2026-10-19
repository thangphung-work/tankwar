/**
 * XE CHI VIỆN HỎA LỰC HẠNG NẶNG HAILSTORM R6  (tankType: GATLING)
 *
 * Thiết kế hư cấu: xe chi viện hỏa lực cận chiến trên khung gầm xích hạng nặng, động cơ đặt trước.
 * - Giáp mũi dài thoải, lưới hút gió động cơ trên nóc trước, cửa xả khí bên sườn phải
 * - Bánh sao chủ động phía trước, 6 cặp bánh chịu tải lớn, bánh dẫn hướng phía sau
 * - Lưỡi ủi thủy lực dọn chướng ngại phía trước
 * - Váy xích module dày gắn gạch giáp phản ứng nổ (ERA), lồng thép chống RPG bao đuôi xe
 * - Tháp thấp, pháo 6 nòng xoay 30mm trong hộp giáp, 2 hòm đạn hai bên tháp + máng tiếp đạn
 *
 * Hook gameplay giữ nguyên: gatlingCluster (xoay quanh trục Z), gatlingHeatMat (nòng nóng đỏ),
 * barrelGroup (giật nòng), muzzleTipLocal. Tỉ lệ ~8 đơn vị = 1 mét, mũi xe hướng -Z.
 */

(function () {
  if (typeof TankModelBuilder === 'undefined' || typeof VehicleKit === 'undefined') return;

  const TRACK_X = 12.6;
  const TRACK_W = 5.6;
  const LINK_IN = 0.3;
  const WHEEL_R = 3.1;
  const WHEEL_Y = 0.62 + LINK_IN + WHEEL_R;
  const WHEEL_Z = [-17.5, -10.1, -2.7, 4.7, 12.1, 19.5];
  const SPROCKET = { z: -25.6, y: 5.7, r: 2.8 };   // bánh sao chủ động phía trước
  const IDLER = { z: 27.6, y: 5.1, r: 2.7 };       // bánh dẫn hướng phía sau
  const RETURN_ROLLER_Z = [-13.8, 1.0, 15.8];
  const RETURN_ROLLER_R = 1.0;
  const HULL_HALF_W = 15.2;
  const ROOF_Y = 14.2;
  const SPONSON_Y = 9.6;
  const GLACIS_SLOPE = (ROOF_Y - SPONSON_Y) / (30.6 - 14.5);
  const GLACIS_ANGLE = Math.atan(GLACIS_SLOPE);
  const glacisY = (z) => SPONSON_Y + (z + 30.6) * GLACIS_SLOPE;

  function buildHailstorm(builder) {
    const unit = builder.unit;
    const K = VehicleKit;
    const M = K.createMaterials(unit.team);
    M.bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const rnd = K.mulberry32((Math.random() * 1e9) | 0);

    const chassis = new THREE.Group();
    unit.chassisGroup = chassis;
    builder.chassisGroup = chassis;
    unit.group.add(chassis);

    buildHull(chassis, M, unit);
    const running = buildRunningGear(chassis, M);
    unit.trackSystem = running.tracks;
    const turretParts = buildTurret(chassis, M, unit, rnd);
    const gun = buildRotaryCannon(unit, M);
    unit.gatlingSpinByModel = true; // spg.js không tự xoay cụm nòng, animator bên dưới đảm nhiệm

    unit.roadWheels = [];
    unit.strobeLight = null;
    unit.radarDish = null;
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
        // Xích bị đứt (hệ thống hư hại đặt u.trackBroken[0|1]) -> dải xích bên đó đứng im
        const br = u.trackBroken;
        const dl = (br && br[0]) ? 0 : v * dt - dYaw * TRACK_X;
        const dr = (br && br[1]) ? 0 : v * dt + dYaw * TRACK_X;
        if (Math.abs(dl) > 1e-5 || Math.abs(dr) > 1e-5) {
          running.tracks.advance([dl, dr]);
          for (const ws of running.wheelSets) ws.roll(dl, dr);
        }
        if (!u.isDead) {
          scanTime += dt;
          turretParts.periHead.rotation.y = Math.sin(scanTime * 0.3) * 1.6;
        }
        updateGunFx(gun, u, dt);
      }
    };

    return { hullW: HULL_HALF_W * 2 };
  }

  // ===========================================================================
  // THÂN XE (ĐỘNG CƠ TRƯỚC)
  // ===========================================================================
  function buildHull(chassis, M, unit) {
    const hb = new VehicleKit.PartBatch();
    const P = M.paint, D = M.dark;

    // Thân trên: giáp mũi dài thoải -> nóc phẳng -> đuôi vát
    hb.add(VehicleKit.sideProfile([
      [-30.6, SPONSON_Y], [-14.5, ROOF_Y], [27.8, ROOF_Y], [29.4, 13.2], [29.4, SPONSON_Y]
    ], HULL_HALF_W * 2, 0.22), P);

    // Bồn thân dưới giữa hai dải xích
    hb.add(VehicleKit.sideProfile([
      [-30.6, 9.8], [-27.4, 4.3], [27.8, 4.3], [29.2, 6.2], [29.2, 9.8]
    ], 18.8, 0.2), M.paintDusty);

    // Mắt xích dự phòng treo trên giáp mũi (vừa là giáp bổ sung)
    hb.setTag('spareTrack');
    for (let i = 0; i < 6; i++) {
      const x = -11.0 + i * 4.4;
      const z = -27.4;
      hb.box(3.9, 0.55, 1.6, M.track, [x, glacisY(z) + 0.32, z], [-GLACIS_ANGLE, 0, 0]);
      hb.box(1.4, 0.3, 1.0, M.rubber, [x - 0.9, glacisY(z) + 0.68, z], [-GLACIS_ANGLE, 0, 0]);
      hb.box(1.4, 0.3, 1.0, M.rubber, [x + 0.9, glacisY(z) + 0.68, z], [-GLACIS_ANGLE, 0, 0]);
    }
    hb.box(27, 0.25, 0.3, D, [0, glacisY(-26.3) + 0.4, -26.3], [-GLACIS_ANGLE, 0, 0]);
    hb.setTag(null);

    // Đèn pha hai góc mũi có khung bảo vệ
    for (const s of [-1, 1]) {
      const x = s * 12.6, z = -28.9, y = glacisY(z) + 0.8;
      hb.setTag('lamp' + (s < 0 ? 'L' : 'R'));
      hb.box(2.4, 1.4, 1.3, D, [x, y, z]);
      hb.cyl(0.48, 0.48, 0.2, 12, M.lens, [x - s * 0.5, y + 0.1, z - 0.7], 'z');
      hb.cyl(0.3, 0.3, 0.2, 10, M.lens, [x + s * 0.7, y + 0.1, z - 0.7], 'z');
      hb.box(3.0, 0.16, 0.16, P, [x, y + 0.95, z - 1.1]);
      hb.box(0.16, 1.2, 0.16, P, [x - 1.45, y + 0.35, z - 1.1]);
      hb.box(0.16, 1.2, 0.16, P, [x + 1.45, y + 0.35, z - 1.1]);
      hb.setTag(null);
    }

    // Nắp lái xe phía trước trái + kính tiềm vọng
    hb.cyl(1.8, 1.9, 0.35, 18, P, [-7.6, ROOF_Y + 0.17, -11.6]);
    hb.box(1.1, 0.35, 0.7, D, [-7.6, ROOF_Y + 0.25, -9.7]);
    for (const x of [-9.3, -7.6, -5.9]) {
      hb.box(1.1, 0.55, 0.7, D, [x, ROOF_Y + 0.15, -14.3]);
      hb.box(0.9, 0.32, 0.08, M.glass, [x, ROOF_Y + 0.25, -14.68], [-0.5, 0, 0]);
    }

    // Lưới hút gió động cơ trên nóc trước (phải lớn, trái nhỏ)
    const grille = (x0, x1, z0, z1) => {
      const cx = (x0 + x1) / 2, w = x1 - x0, cz = (z0 + z1) / 2, l = z1 - z0;
      hb.box(w, 0.12, l, D, [cx, ROOF_Y + 0.05, cz]);
      hb.box(w + 0.6, 0.4, 0.35, P, [cx, ROOF_Y + 0.2, z0 - 0.15]);
      hb.box(w + 0.6, 0.4, 0.35, P, [cx, ROOF_Y + 0.2, z1 + 0.15]);
      hb.box(0.35, 0.4, l + 0.6, P, [x0 - 0.15, ROOF_Y + 0.2, cz]);
      hb.box(0.35, 0.4, l + 0.6, P, [x1 + 0.15, ROOF_Y + 0.2, cz]);
      const n = Math.floor(l / 0.85);
      for (let i = 0; i < n; i++) {
        hb.box(w - 0.1, 0.06, 0.62, P, [cx, ROOF_Y + 0.22, z0 + 0.45 + i * 0.85], [0.55, 0, 0]);
      }
    };
    grille(1.2, 13.0, -13.4, -3.6);
    grille(-13.0, -3.4, -7.6, -3.6);
    for (const z of [-2.6]) hb.box(27, 0.06, 0.14, D, [0, ROOF_Y + 0.02, z]);

    // Cửa xả khí động cơ trên sườn phải phía trước
    hb.box(0.4, 2.4, 6.4, D, [HULL_HALF_W + 0.1, 12.2, -17.4]);
    for (let i = 0; i < 4; i++) hb.box(0.3, 0.12, 6.2, P, [HULL_HALF_W + 0.3, 11.3 + i * 0.6, -17.4], [0, 0, 0.5]);
    unit.exhaustLeft = new THREE.Object3D();
    unit.exhaustLeft.position.set(HULL_HALF_W + 1.0, 12.2, -19.0);
    unit.exhaustRight = new THREE.Object3D();
    unit.exhaustRight.position.set(HULL_HALF_W + 1.0, 12.2, -15.8);
    chassis.add(unit.exhaustLeft);
    chassis.add(unit.exhaustRight);

    // Nắp tổ lái phía sau, thùng đồ dọc nóc, can nhiên liệu, cáp kéo
    for (const s of [-1, 1]) {
      hb.cyl(1.7, 1.8, 0.32, 16, P, [s * 5.4, ROOF_Y + 0.16, 21.6]);
      hb.box(0.9, 0.35, 0.5, D, [s * 5.4, ROOF_Y + 0.3, 23.4]);
      hb.setTag('bin' + (s < 0 ? 'L' : 'R'));
      hb.box(2.6, 2.2, 10.5, P, [s * 13.0, ROOF_Y + 1.1, 20.6]);
      hb.box(2.7, 0.08, 10.6, D, [s * 13.0, ROOF_Y + 1.65, 20.6]);
      for (const z of [17.5, 23.6]) hb.box(0.15, 0.6, 0.5, M.steel, [s * 14.36, ROOF_Y + 1.3, z]);
      hb.setTag(null);
      hb.cyl(0.28, 0.28, 24, 8, M.steel, [s * 14.2, ROOF_Y + 0.3, -2], 'z');
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [s * 14.2, ROOF_Y + 0.3, -14.6], [Math.PI / 2, 0, 0]);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12), M.steel, [s * 14.2, ROOF_Y + 0.3, 10.6], [Math.PI / 2, 0, 0]);
      for (const z of [-8, 3]) hb.box(0.9, 0.55, 0.5, D, [s * 14.2, ROOF_Y + 0.25, z]);
    }
    hb.setTag('cans');
    for (let i = 0; i < 3; i++) hb.box(0.9, 1.9, 1.4, P, [-4.0 + i * 1.05, ROOF_Y + 0.95, 27.0]);
    hb.setTag(null);

    // Tấm đuôi: cửa sau tổ lái, bản lề, đèn hậu, móc kéo
    hb.box(8.4, 7.6, 0.3, P, [0, 9.4, 29.55]);
    hb.box(8.6, 0.08, 0.36, D, [0, 13.2, 29.56]);
    for (const y of [7.0, 11.8]) hb.box(0.6, 1.0, 0.5, D, [-4.4, y, 29.6]);
    hb.box(0.3, 1.4, 0.3, M.steel, [3.2, 9.6, 29.8]);
    for (const s of [-1, 1]) {
      hb.box(1.8, 1.0, 0.5, D, [s * 13.4, 12.3, 29.6]);
      hb.box(0.7, 0.55, 0.12, M.tailLens, [s * 13.8, 12.35, 29.88]);
      hb.box(0.5, 0.4, 0.12, M.lens, [s * 12.9, 12.35, 29.88]);
      hb.box(1.6, 1.2, 1.0, M.paintDusty, [s * 7.0, 6.2, 29.3]);
      hb.add(new THREE.TorusGeometry(0.7, 0.2, 6, 12, Math.PI * 1.3), M.steel, [s * 7.0, 5.4, 29.9], [0, Math.PI / 2, Math.PI * 0.85]);
      hb.box(1.8, 1.3, 1.2, M.paintDusty, [s * 6.5, 6.7, -29.3]);
      hb.add(new THREE.TorusGeometry(0.75, 0.22, 6, 12, Math.PI * 1.3), M.steel, [s * 6.5, 5.8, -30.0], [0, Math.PI / 2, Math.PI * 0.85]);
    }

    // Lồng thép chống đạn RPG bao đuôi xe
    const slatZ = 33.0, sy0 = 5.8, sy1 = 13.8;
    hb.setTag('cageRear');
    for (const x of [-14.8, -7.4, 0, 7.4, 14.8]) {
      hb.box(0.35, sy1 - sy0 + 0.4, 0.35, D, [x, (sy0 + sy1) / 2, slatZ]);
    }
    for (const x of [-13.6, -5.2, 5.2, 13.6]) {
      for (const y of [7.0, 12.6]) hb.beam([x, y, 29.4], [x, y, slatZ], 0.3, 0.3, D);
    }
    for (let i = 0; i < 7; i++) {
      const y = sy0 + 0.4 + i * 1.25;
      hb.box(29.6, 0.7, 0.2, D, [0, y, slatZ - 0.1]);
    }
    for (const s of [-1, 1]) {
      // Hai cánh lồng bên sườn sau
      hb.box(0.35, sy1 - sy0 + 0.4, 0.35, D, [s * 16.4, (sy0 + sy1) / 2, 26.8]);
      hb.beam([s * 14.8, 13.2, slatZ], [s * 16.4, 13.2, 26.8], 0.3, 0.3, D);
      hb.beam([s * 14.8, 7.2, slatZ], [s * 16.4, 7.2, 26.8], 0.3, 0.3, D);
      for (let i = 0; i < 7; i++) {
        const y = sy0 + 0.4 + i * 1.25;
        hb.beam([s * 16.4, y, 26.8], [s * 14.9, y, slatZ - 0.2], 0.2, 0.7, D);
      }
    }
    hb.setTag(null);

    // Váy xích module dày gắn gạch giáp phản ứng nổ
    for (const s of [-1, 1]) {
      const z0 = -29.0, z1 = 26.4, n = 4;
      const seg = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        const a = z0 + i * seg + 0.1, b = a + seg - 0.2;
        const pts = i === 0
          ? [[a, 10.3], [a, 7.8], [a + 2.2, 4.7], [b, 4.7], [b, 10.3]]
          : [[a, 10.3], [a, 4.7], [b, 4.7], [b, 10.3]];
        hb.setTag('skirt' + (s < 0 ? 'L' : 'R') + i);
        hb.add(VehicleKit.sideProfile(pts, 1.2, 0.1), P, [s * 15.95, 0, 0]);
        hb.box(0.5, 0.7, seg - 0.4, M.rubber, [s * 15.95, 4.35, (a + b) / 2]);
        hb.setTag('era' + (s < 0 ? 'L' : 'R') + i);
        // 2 hàng gạch ERA trên nửa trên module
        const tiles = Math.floor((b - a - 0.4) / 2.15);
        for (let r = 0; r < 2; r++) {
          for (let k = 0; k < tiles; k++) {
            const z = a + 0.3 + 1.05 + k * 2.15;
            if (i === 0 && r === 0 && z < a + 2.4) continue;
            const y = 7.4 + r * 1.75;
            hb.box(0.5, 1.6, 2.0, P, [s * 16.8, y, z]);
            hb.cyl(0.14, 0.14, 0.2, 6, D, [s * 17.08, y, z], 'x');
          }
        }
        hb.setTag(null);
      }
      hb.box(0.6, 0.4, 55.8, P, [s * 15.75, 10.45, -1.3]);
    }

    // Lưỡi ủi thủy lực phía trước (mặt lõm, lưỡi cắt thép, gân gia cường)
    hb.setTag('dozer');
    const front = [], back = [];
    for (let i = 0; i <= 8; i++) {
      const y = 1.0 + i * (7.6 / 8);
      const k = (y - 4.8) / 3.8;
      const z = -36.8 + 1.5 * (1 - k * k);
      front.push([z, y]);
      back.unshift([z + 0.6, y]);
    }
    hb.add(VehicleKit.sideProfile(front.concat(back), 31.6, 0.08), M.paintDusty);
    hb.box(31.6, 0.5, 0.8, M.steel, [0, 1.15, -36.55]);
    hb.box(31.8, 0.35, 0.9, M.paintDusty, [0, 8.7, -36.5]);
    for (const x of [-13, -6.5, 0, 6.5, 13]) hb.box(0.45, 6.4, 0.9, M.paintDusty, [x, 4.8, -35.0]);
    for (const s of [-1, 1]) {
      // Tay đẩy lưỡi ủi + giá bản lề
      hb.beam([s * 8.4, 3.8, -34.5], [s * 8.4, 5.6, -28.2], 1.2, 1.2, M.paintDusty);
      hb.box(2.0, 1.6, 1.4, D, [s * 8.4, 5.6, -28.4]);
      // Xi-lanh thủy lực: vỏ sơn + cần piston thép bóng
      const p0 = [s * 5.0, 9.0, -30.2], p1 = [s * 5.0, 7.4, -34.9];
      const mid = [s * 5.0, 8.2, -32.6];
      hb.strut(p0, mid, 0.62, M.paintDusty, 10);
      hb.strut(mid, p1, 0.3, M.steel, 8);
      hb.box(1.2, 1.0, 1.0, D, [s * 5.0, 9.0, -30.0]);
    }
    hb.setTag(null);

    // Tay đòn treo, giá bánh dẫn hướng, hộp truyền lực cuối phía trước
    for (const s of [-1, 1]) {
      for (const z of WHEEL_Z) hb.box(1.1, 0.95, 3.6, D, [s * 10.1, WHEEL_Y + 0.75, z + 1.5], [0.35, 0, 0]);
      hb.cyl(1.8, 2.0, 1.6, 14, M.paintDusty, [s * 9.9, SPROCKET.y, SPROCKET.z], 'x');
      hb.box(1.2, 1.4, 4.2, D, [s * 10.1, IDLER.y + 0.6, IDLER.z - 2.0], [-0.4, 0, 0]);
    }

    const meshes = hb.build(chassis, [0, 10, 0]);
    unit.hullMainMesh = meshes.get(P);
  }

  // ===========================================================================
  // HỆ THỐNG DI CHUYỂN
  // ===========================================================================
  function buildRunningGear(chassis, M) {
    const halfSpan = TRACK_W / 2;

    // Bánh chịu tải kép đường kính lớn, đĩa thép đúc có lỗ giảm trọng
    const roadPositions = [];
    for (const s of [-1, 1]) for (const z of WHEEL_Z) roadPositions.push({ x: s * TRACK_X, y: WHEEL_Y, z });
    const roadWheels = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.6, 1.6]) {
        b.cyl(WHEEL_R, WHEEL_R, 2.0, 24, M.rubber, [off, 0, 0], 'x');
        b.cyl(2.6, 2.6, 2.1, 24, M.paintDusty, [off, 0, 0], 'x');
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        b.cyl(0.42, 0.42, 0.12, 10, M.dark, [2.67, Math.cos(a) * 1.65, Math.sin(a) * 1.65], 'x');
      }
      b.cyl(1.0, 1.15, 0.5, 12, M.steel, [2.85, 0, 0], 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.cyl(0.12, 0.12, 0.3, 6, M.dark, [3.1, Math.cos(a) * 0.68, Math.sin(a) * 0.68], 'x');
      }
    }, roadPositions, WHEEL_R);

    // Bánh sao chủ động phía trước
    const sprockets = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.75, 1.75]) {
        b.cyl(2.45, 2.45, 0.85, 22, M.paintDusty, [off, 0, 0], 'x');
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          b.box(0.8, 0.85, 0.72, M.steel, [off, Math.cos(a) * 2.65, Math.sin(a) * 2.65], [a, 0, 0]);
        }
      }
      b.cyl(1.7, 1.7, 2.7, 16, M.paintDusty, [0, 0, 0], 'x');
      b.cyl(1.15, 1.35, 0.6, 12, M.steel, [2.4, 0, 0], 'x');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.cyl(0.14, 0.14, 0.3, 6, M.dark, [2.7, Math.cos(a) * 0.85, Math.sin(a) * 0.85], 'x');
      }
    }, [{ x: -TRACK_X, y: SPROCKET.y, z: SPROCKET.z }, { x: TRACK_X, y: SPROCKET.y, z: SPROCKET.z }], SPROCKET.r + LINK_IN);

    // Bánh dẫn hướng phía sau
    const idlers = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.6, 1.6]) {
        b.cyl(IDLER.r, IDLER.r, 1.9, 22, M.paintDusty, [off, 0, 0], 'x');
        b.cyl(IDLER.r + 0.02, IDLER.r + 0.02, 0.3, 22, M.steel, [off + 0.8, 0, 0], 'x');
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cyl(0.4, 0.4, 0.1, 10, M.dark, [2.6, Math.cos(a) * 1.5, Math.sin(a) * 1.5], 'x');
      }
      b.cyl(0.8, 0.9, 0.6, 12, M.steel, [2.7, 0, 0], 'x');
    }, [{ x: -TRACK_X, y: IDLER.y, z: IDLER.z }, { x: TRACK_X, y: IDLER.y, z: IDLER.z }], IDLER.r + LINK_IN);

    const topIn = (z) => {
      const k = (z - SPROCKET.z) / (IDLER.z - SPROCKET.z);
      return (SPROCKET.y + SPROCKET.r) + ((IDLER.y + IDLER.r) - (SPROCKET.y + SPROCKET.r)) * k;
    };
    const rollerPositions = [];
    for (const s of [-1, 1]) {
      for (const z of RETURN_ROLLER_Z) rollerPositions.push({ x: s * TRACK_X, y: topIn(z) - RETURN_ROLLER_R - 0.02, z });
    }
    const returnRollers = new VehicleKit.WheelSet(chassis, (b) => {
      for (const off of [-1.3, 1.3]) b.cyl(RETURN_ROLLER_R, RETURN_ROLLER_R, 1.4, 14, M.rubber, [off, 0, 0], 'x');
      b.cyl(0.55, 0.55, 4.0, 10, M.steel, [0, 0, 0], 'x');
    }, rollerPositions, RETURN_ROLLER_R);

    // Xích hạng nặng: mắt xích thép đúc có gân bám, 2 răng dẫn hướng
    const tracks = new VehicleKit.TrackSystem(chassis, {
      circles: [
        { u: SPROCKET.z, v: SPROCKET.y, r: SPROCKET.r + LINK_IN },
        { u: WHEEL_Z[0], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: WHEEL_Z[WHEEL_Z.length - 1], v: WHEEL_Y, r: WHEEL_R + LINK_IN },
        { u: IDLER.z, v: IDLER.y, r: IDLER.r + LINK_IN }
      ],
      sidesX: [-TRACK_X, TRACK_X],
      pitch: 1.6,
      buildLink: (b, pitch) => {
        b.box(TRACK_W - 0.2, 0.6, pitch * 0.82, M.track, [0, 0, 0]);
        b.box(TRACK_W - 0.6, 0.32, pitch * 0.3, M.track, [0, 0.45, -pitch * 0.12]);
        b.box(0.5, 0.56, 0.62, M.steel, [-halfSpan - 0.05, 0, pitch / 2]);
        b.box(0.5, 0.56, 0.62, M.steel, [halfSpan + 0.05, 0, pitch / 2]);
        b.box(0.5, 0.5, 0.6, M.track, [0, 0, pitch / 2]);
        b.box(0.55, 1.2, pitch * 0.42, M.track, [0, -0.88, 0]);
      }
    });

    return { tracks, wheelSets: [roadWheels, sprockets, idlers, returnRollers] };
  }

  // ===========================================================================
  // THÁP PHÁO THẤP + 2 HÒM ĐẠN + MÁNG TIẾP ĐẠN
  // ===========================================================================
  function buildTurret(chassis, M, unit, rnd) {
    const turret = new THREE.Group();
    turret.position.set(0, ROOF_Y, 5.0);
    unit.turretGroup = turret;
    chassis.add(turret);

    const tb = new VehicleKit.PartBatch(ROOF_Y);
    const P = M.paint, D = M.dark;
    const TROOF = 5.6;

    tb.cyl(9.0, 9.2, 0.6, 32, D, [0, 0.3, 0]);

    // Thân tháp vát đa diện
    tb.add(VehicleKit.loft(
      [[-8.6, -10], [8.6, -10], [10.4, -7], [10.4, 8.5], [8.8, 12], [-8.8, 12], [-10.4, 8.5], [-10.4, -7]],
      [[-7.8, -8.6], [7.8, -8.6], [9.6, -6.2], [9.6, 8.0], [8.2, 11.4], [-8.2, 11.4], [-9.6, 8.0], [-9.6, -6.2]],
      0.5, TROOF
    ), P);

    // Khối giáp bổ sung mặt trước hai bên hộp pháo
    for (const s of [-1, 1]) {
      const pts = [[s * 3.9, -10.1], [s * 9.0, -10.1], [s * 9.0, -11.3], [s * 4.6, -12.6]];
      tb.setTag('cheek' + (s < 0 ? 'L' : 'R'));
      tb.add(VehicleKit.loft(pts, pts, 0.8, [5.0, 5.0, 4.6, 3.9]), P);
      for (let i = 0; i < 3; i++) {
        const k = (i + 0.5) / 3;
        tb.cyl(0.18, 0.18, 0.2, 6, D, [s * (9.0 + (4.6 - 9.0) * k), 4.6 + (3.9 - 4.6) * k - 0.2, -11.3 + (-12.6 + 11.3) * k]);
      }
      tb.setTag(null);
    }

    // Hai hòm đạn bọc giáp hai bên tháp (nắp nghiêng, chốt khóa, tay xách)
    for (const s of [-1, 1]) {
      const pts = [[s * 10.1, -7.5], [s * 13.4, -6.8], [s * 13.4, 5.5], [s * 10.1, 5.5]];
      tb.add(VehicleKit.loft(pts, pts, 0.9, [5.5, 4.9, 4.9, 5.5]), P);
      tb.box(0.08, 0.1, 12.0, D, [s * 11.75, 5.25, -0.9], [0, 0, s * 0.18]);
      for (const z of [-4.5, 2.5]) {
        tb.box(0.18, 0.8, 0.6, M.steel, [s * 13.46, 3.9, z]);
      }
      tb.beam([s * 13.5, 2.0, -3.5], [s * 13.5, 2.0, 0.5], 0.2, 0.2, M.steel);
      // Máng tiếp đạn khớp đốt từ hòm đạn vào hộp pháo
      tb.setTag('feed' + (s < 0 ? 'L' : 'R'));
      const p0 = [s * 10.6, 5.7, -6.6], p1 = [s * 8.6, 6.6, -13.4], p2 = [s * 3.8, 3.7, -13.6];
      const N = 11;
      for (let i = 0; i < N; i++) {
        const a = VehicleKit.bezier3(p0, p1, p2, i / N);
        const c = VehicleKit.bezier3(p0, p1, p2, (i + 1) / N);
        const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
        const shrink = (p) => [m[0] + (p[0] - m[0]) * 0.86, m[1] + (p[1] - m[1]) * 0.86, m[2] + (p[2] - m[2]) * 0.86];
        tb.beam(shrink(a), shrink(c), 1.5, 0.7, i % 2 ? D : M.steel);
      }
      tb.box(1.8, 1.2, 1.4, D, [s * 10.7, 5.6, -6.5]);
      tb.setTag(null);
    }

    // Kính ngắm pháo thủ (trước trái) có cửa chớp giáp
    tb.setTag('opticGunner');
    tb.box(3.0, 2.0, 3.2, P, [-5.6, TROOF + 1.0, -6.0]);
    tb.box(2.2, 0.9, 0.12, M.glass, [-5.6, TROOF + 1.2, -7.65]);
    tb.box(1.2, 1.4, 0.14, P, [-7.0, TROOF + 1.3, -7.9], [0, 0.7, 0]);
    tb.box(1.2, 1.4, 0.14, P, [-4.2, TROOF + 1.3, -7.9], [0, -0.7, 0]);
    tb.setTag('searchlight');

    // Đèn chiếu hồng ngoại / ánh sáng trắng có cửa chớp (trước phải)
    tb.box(1.4, 1.0, 1.6, D, [6.4, TROOF + 0.5, -6.8]);
    tb.cyl(1.15, 1.15, 2.2, 16, P, [6.4, TROOF + 1.9, -7.0], 'z');
    tb.cyl(0.95, 0.95, 0.1, 16, M.lens, [6.4, TROOF + 1.9, -8.12], 'z');
    tb.box(2.6, 0.2, 0.2, D, [6.4, TROOF + 3.1, -8.1]);
    tb.setTag(null);

    // Kính toàn cảnh trưởng xe trên trụ (đầu xoay quét)
    tb.cyl(0.85, 1.0, 2.2, 12, P, [5.8, TROOF + 1.1, 1.6]);
    const periHead = new THREE.Group();
    periHead.position.set(5.8, TROOF + 2.95, 1.6);
    const ph = new VehicleKit.PartBatch(ROOF_Y + TROOF + 2.95);
    ph.box(2.2, 1.5, 2.2, P, [0, 0, 0]);
    ph.box(1.5, 0.7, 0.1, M.glass, [0, 0.1, -1.13]);
    ph.box(2.4, 0.18, 2.4, D, [0, 0.8, 0]);
    ph.build(periHead);
    turret.add(periHead);
    VehicleKit.registerPartGroup(unit, 'opticCdr', periHead);

    // Nắp tháp, tấm nhận diện phe, cảm biến gió, ăng-ten
    tb.cyl(1.85, 1.95, 0.32, 18, P, [-4.8, TROOF + 0.16, 5.2]);
    tb.box(0.9, 0.35, 0.5, D, [-4.8, TROOF + 0.3, 7.1]);
    tb.box(4.6, 0.08, 3.2, M.idPanel, [1.6, TROOF + 0.06, 7.6], [0, -0.05, 0]);
    tb.cyl(0.12, 0.14, 2.4, 6, D, [-1.8, TROOF + 1.2, 9.8]);
    tb.box(1.3, 0.12, 0.12, D, [-1.8, TROOF + 2.4, 9.8]);
    const ant = new VehicleKit.AntennaSet(D, turret);
    for (const s of [-1, 1]) {
      tb.cyl(0.45, 0.5, 0.7, 8, D, [s * 7.0, TROOF + 0.35, 10.2]);
      ant.add([s * 7.0, TROOF + 0.7, 10.2], 14, { tilt: [0.12, 0], r0: 0.09, r1: 0.05 });
    }
    ant.build();
    (unit.antennaSets || (unit.antennaSets = [])).push(ant);

    // Ống phóng lựu đạn khói 3 ống mỗi bên ở góc sau tháp
    for (const s of [-1, 1]) {
      tb.setTag('smoke' + (s < 0 ? 'L' : 'R'));
      tb.box(0.45, 1.3, 3.4, P, [s * 9.95, 4.5, 8.8], [0, s * -0.25, 0]);
      for (let i = 0; i < 3; i++) {
        tb.cyl(0.4, 0.4, 1.6, 10, D, [s * 10.5, 5.0, 7.7 + i * 1.05], 'y', [-0.35, 0, -s * 0.85]);
      }
      tb.setTag(null);
    }

    // Lồng thép chống RPG sau đuôi tháp
    const cz = 14.6;
    tb.setTag('cageTurret');
    for (const x of [-8.4, 0, 8.4]) tb.box(0.3, 4.4, 0.3, D, [x, 3.2, cz]);
    for (const x of [-6.0, 6.0]) for (const y of [1.6, 4.8]) tb.beam([x, y, 11.6], [x, y, cz], 0.26, 0.26, D);
    for (let i = 0; i < 4; i++) tb.box(17.0, 0.6, 0.18, D, [0, 1.6 + i * 1.1, cz - 0.08]);
    tb.setTag(null);

    tb.build(turret);

    // Số hiệu chiến thuật trên mặt ngoài hòm đạn
    const tacNumber = `${4 + Math.floor(rnd() * 3)}${1 + Math.floor(rnd() * 4)}${1 + Math.floor(rnd() * 9)}`;
    for (const s of [-1, 1]) {
      const decal = VehicleKit.createStencilDecal(tacNumber, 4.0, 1.5);
      if (decal) {
        decal.position.set(s * 13.43, 2.9, -0.8);
        decal.rotation.y = s * Math.PI / 2;
        turret.add(decal);
      }
    }

    return { periHead };
  }

  // ===========================================================================
  // PHÁO 6 NÒNG XOAY 30MM
  // ===========================================================================
  function buildRotaryCannon(unit, M) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 3.2, -10.5);
    unit.barrelPivot = pivot;
    unit.turretGroup.add(pivot);

    // Hộp giáp bao khối pháo + súng máy đồng trục
    const mb = new VehicleKit.PartBatch(ROOF_Y + 3.2);
    const mPts = [[-3.6, 2], [3.6, 2], [3.6, -4.6], [2.6, -6.2], [-2.6, -6.2], [-3.6, -4.6]];
    mb.add(VehicleKit.loft(mPts, mPts, -2.4, 2.6), M.paint);
    mb.box(7.0, 0.08, 0.14, M.dark, [0, 2.62, -3.0]);
    mb.cyl(0.22, 0.22, 1.2, 8, M.dark, [-2.6, -1.4, -6.6], 'z');
    mb.build(pivot);

    const barrel = new THREE.Group();
    unit.barrelGroup = barrel;
    pivot.add(barrel);

    // Cụm vỏ rotor cố định
    const hb = new VehicleKit.PartBatch(ROOF_Y + 3.2);
    hb.cyl(2.2, 2.3, 1.0, 20, M.dark, [0, 0, -6.6], 'z');
    hb.cyl(2.0, 2.15, 2.6, 20, M.steel, [0, 0, -8.4], 'z');
    hb.build(barrel);

    // Cụm 6 nòng xoay quanh trục Z (gameplay xoay gatlingCluster.rotation.z)
    const cluster = new THREE.Group();
    unit.gatlingCluster = cluster;
    barrel.add(cluster);

    const heatMat = new THREE.MeshStandardMaterial({
      color: 0x3b3a36, roughness: 0.45, metalness: 0.7, emissive: 0x000000, emissiveIntensity: 0
    });
    unit.gatlingHeatMat = heatMat;

    const cb = new VehicleKit.PartBatch(ROOF_Y + 3.2);
    const ringR = 1.35, z0 = -9.6, z1 = -36.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * ringR, y = Math.sin(a) * ringR;
      cb.cyl(0.3, 0.35, z0 - z1, 12, heatMat, [x, y, (z0 + z1) / 2], 'z');
      cb.cyl(0.38, 0.38, 0.8, 12, heatMat, [x, y, z1 + 0.4], 'z');
      cb.cyl(0.2, 0.2, 0.06, 8, M.bore, [x, y, z1 - 0.02], 'z');
    }
    cb.cyl(0.55, 0.55, z0 - (z1 + 1.6), 10, M.dark, [0, 0, (z0 + z1 + 1.6) / 2], 'z');
    cb.cyl(1.95, 1.95, 0.8, 18, M.dark, [0, 0, -10.2], 'z');
    cb.cyl(1.85, 1.85, 0.6, 18, M.dark, [0, 0, -23.0], 'z');
    cb.cyl(1.85, 1.85, 0.9, 18, M.dark, [0, 0, -35.0], 'z');
    cb.build(cluster);

    unit.muzzleTipLocal = new THREE.Vector3(0, 0, -37.0);

    // Vòng mờ chuyển động khi cụm nòng quay nhanh (hiện dần theo tốc độ quay)
    const blurMat = new THREE.MeshBasicMaterial({
      color: 0x2b2a27, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    });
    const blur = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 25.6, 24, 1, true), blurMat);
    blur.geometry.rotateX(-Math.PI / 2);
    blur.position.z = (z0 + z1) / 2 - 0.3;
    blur.visible = false;
    barrel.add(blur);

    // Chớp lửa đầu nòng: 1 đĩa nhìn thẳng + 2 cánh lửa dọc theo nòng
    const flashTex = VehicleKit.getMuzzleFlashTexture();
    const flashMat = new THREE.MeshBasicMaterial({
      map: flashTex, color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const flash = new THREE.Group();
    flash.position.z = z1 - 1.2;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 6.5), flashMat);
    flash.add(disc);
    for (const rz of [0, Math.PI / 2]) {
      const petal = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 9.5), flashMat);
      petal.rotation.set(Math.PI / 2, 0, rz);
      petal.position.z = -3.6;
      flash.add(petal);
    }
    flash.visible = false;
    barrel.add(flash);

    return { cluster, heatMat, blur, blurMat, flash, flashMat, omega: 0 };
  }

  // ===========================================================================
  // HIỆU ỨNG KHI XẢ ĐẠN: QUAY NÒNG, VÒNG MỜ, CHỚP LỬA ĐẦU NÒNG
  // ===========================================================================
  const MAX_SPIN = 52.0;          // rad/s (khớp spg.js tốc độ xả đạn mới)
  const MAX_VISUAL_STEP = 0.48;   // khống chế bước quay mỗi khung hình để tránh hiệu ứng quay ngược
  const SPIN_DOWN_RATE = 1.6;     // hệ số giảm tốc khi nhả cò (~1.5-2s dừng hẳn)
  function updateGunFx(gun, u, dt) {
    // Quán tính cụm nòng: mô-tơ kéo lên nhanh theo gameplay, nhả cò thì quay chậm dần đều
    // (spinUpTime của gameplay tụt về 0 trong ~0.3s -> nếu bám theo sẽ khựng giật cục)
    const target = u.isDead ? 0 : Math.max(0, Math.min(1, (u.spinUpTime || 0) / (u.spinRequired || 1))) * MAX_SPIN;
    if (target > gun.omega) {
      gun.omega += (target - gun.omega) * Math.min(1, dt * 10);
    } else {
      gun.omega = Math.max(target, gun.omega * Math.exp(-dt * SPIN_DOWN_RATE) - dt * 1.5);
    }
    if (gun.omega < 0.05) gun.omega = 0;
    gun.cluster.rotation.z += Math.min(gun.omega * dt, MAX_VISUAL_STEP);
    const spin = gun.omega / MAX_SPIN;
    u.gatlingVisualSpin = spin; // âm thanh mô-tơ dùng chung tốc độ đã làm mượt

    const stealth = u.stealthAlpha !== undefined ? u.stealthAlpha : 1;
    // Hiệu ứng tàng hình (spg.js) có thể bật depthWrite cho mọi vật liệu -> giữ tắt cho lớp trong suốt
    gun.blurMat.depthWrite = false;
    gun.flashMat.depthWrite = false;

    // Vòng mờ đậm dần khi quay > 45% công suất, ngả màu nóng theo nhiệt độ nòng
    const blurK = Math.max(0, (spin - 0.45) / 0.55);
    gun.blur.visible = blurK > 0.01;
    if (gun.blur.visible) {
      gun.blurMat.opacity = blurK * 0.5 * stealth;
      const hot = Math.min(1, (gun.heatMat.emissiveIntensity || 0) * 0.2);
      const e = gun.heatMat.emissive;
      gun.blurMat.color.setRGB(0.17 + e.r * hot * 0.8, 0.165 + e.g * hot * 0.5, 0.155 + e.b * hot * 0.3);
    }

    // Chớp lửa: bùng lên mỗi viên đạn (spg.js đặt gatlingShotFlash = 1), tắt rất nhanh
    let f = u.gatlingShotFlash || 0;
    if (u.isDead) f = 0;
    if (f > 0.02) {
      if (f >= 0.999) {
        const k = 0.75 + Math.random() * 0.5;
        gun.flash.scale.set(k, k, 0.8 + Math.random() * 0.6);
        gun.flash.rotation.z = Math.random() * Math.PI;
      }
      gun.flash.visible = true;
      gun.flashMat.opacity = Math.min(1, f) * stealth;
      u.gatlingShotFlash = f * Math.exp(-dt * 28);
    } else {
      gun.flash.visible = false;
      u.gatlingShotFlash = 0;
    }
  }

  TankModelBuilder.registerModel('GATLING', buildHailstorm);
})();
